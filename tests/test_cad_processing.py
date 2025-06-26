import unittest
import tempfile
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import main


class TestCADProcessing(unittest.TestCase):
    """Test suite for CAD file processing functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.test_dir = tempfile.mkdtemp()
        self.test_filename = "test_file.step"
        
    def tearDown(self):
        """Clean up test fixtures"""
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_save_uploaded_file_base64(self):
        """Test saving base64 encoded file"""
        # Test base64 content
        test_content = "VGVzdCBjb250ZW50"  # "Test content" in base64
        filename = "test.step"
        
        result = main.save_uploaded_file(test_content, filename)
        
        self.assertIn("success", result)
        self.assertTrue(result["success"])
        self.assertIn("path", result)
        
        # Verify file was created
        saved_path = Path(result["path"])
        self.assertTrue(saved_path.exists())
        
        # Verify content
        with open(saved_path, 'rb') as f:
            content = f.read()
        self.assertEqual(content, b"Test content")
        
        # Clean up
        saved_path.unlink()
    
    def test_save_uploaded_file_error(self):
        """Test error handling in save_uploaded_file"""
        # Test with invalid base64
        result = main.save_uploaded_file("invalid base64!", "test.step")
        
        self.assertIn("error", result)
        self.assertIn("File save error", result["error"])
    
    @patch('cadquery.importers.importStep')
    @patch('cadquery.exporters.export')
    def test_process_step_file(self, mock_export, mock_import):
        """Test STEP file processing"""
        # Mock CadQuery operations
        mock_import.return_value = MagicMock()
        
        # Create a dummy STL file for testing
        stl_path = main.TEMP_DIR / "A.stl"
        with open(stl_path, 'wb') as f:
            # Write minimal binary STL header
            f.write(b'\x00' * 80)  # Header
            f.write(b'\x00\x00\x00\x00')  # Number of triangles (0)
        
        # Mock the read_stl_to_json to return test data
        with patch.object(main, 'read_stl_to_json') as mock_read_stl:
            mock_read_stl.return_value = {
                "vertices": [0, 0, 0, 1, 0, 0, 0, 1, 0],
                "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
                "indices": [0, 1, 2]
            }
            
            # Process file
            result = main.process_step_file("test.step", "A")
            
            # Verify result
            self.assertNotIn("error", result)
            self.assertIn("vertices", result)
            self.assertIn("normals", result)
            self.assertIn("indices", result)
    
    def test_read_stl_manual(self):
        """Test manual STL reading"""
        # Create a minimal binary STL file
        stl_path = Path(self.test_dir) / "test.stl"
        with open(stl_path, 'wb') as f:
            # Header (80 bytes)
            f.write(b'Minimal STL file' + b'\x00' * 64)
            
            # Number of triangles (1)
            f.write((1).to_bytes(4, 'little'))
            
            # Triangle data
            # Normal vector (3 floats)
            import struct
            f.write(struct.pack('<fff', 0.0, 0.0, 1.0))
            
            # Vertex 1
            f.write(struct.pack('<fff', 0.0, 0.0, 0.0))
            # Vertex 2
            f.write(struct.pack('<fff', 1.0, 0.0, 0.0))
            # Vertex 3
            f.write(struct.pack('<fff', 0.0, 1.0, 0.0))
            
            # Attribute byte count
            f.write(b'\x00\x00')
        
        # Read the STL file
        result = main.read_stl_manual(str(stl_path))
        
        # Verify result
        self.assertNotIn("error", result)
        self.assertIn("vertices", result)
        self.assertIn("normals", result)
        self.assertIn("indices", result)
        
        # Check data
        self.assertEqual(len(result["vertices"]), 9)  # 3 vertices * 3 coordinates
        self.assertEqual(len(result["normals"]), 9)   # 3 normals * 3 components
        self.assertEqual(len(result["indices"]), 3)   # 3 indices for 1 triangle
    
    @patch('open3d.geometry.TriangleMesh')
    @patch('open3d.pipelines.registration.registration_icp')
    def test_align_meshes(self, mock_icp, mock_mesh_class):
        """Test mesh alignment functionality"""
        # Mock mesh data
        mesh_data_a = {
            "vertices": [0, 0, 0, 1, 0, 0, 0, 1, 0],
            "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
            "indices": [0, 1, 2]
        }
        mesh_data_b = {
            "vertices": [0.1, 0, 0, 1.1, 0, 0, 0.1, 1, 0],
            "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
            "indices": [0, 1, 2]
        }
        
        # Mock Open3D operations
        import numpy as np
        mock_mesh = MagicMock()
        mock_mesh.vertices = MagicMock()
        mock_mesh.vertex_normals = MagicMock()
        mock_mesh_class.return_value = mock_mesh
        
        # Mock ICP result
        mock_result = MagicMock()
        mock_result.transformation = np.eye(4)
        mock_icp.return_value = mock_result
        
        # Mock transformed vertices
        mock_mesh.vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]])
        mock_mesh.vertex_normals = np.array([[0, 0, 1], [0, 0, 1], [0, 0, 1]])
        
        # Test alignment
        result = main.align_meshes(mesh_data_a, mesh_data_b)
        
        # Verify result
        self.assertNotIn("error", result)
        self.assertIn("vertices", result)
        self.assertIn("transformation", result)
    
    @patch('open3d.geometry.PointCloud')
    def test_calculate_mesh_distance(self, mock_pointcloud_class):
        """Test mesh distance calculation"""
        # Mock mesh data
        mesh_data_a = {
            "vertices": [0, 0, 0, 1, 0, 0, 0, 1, 0],
            "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
            "indices": [0, 1, 2]
        }
        mesh_data_b = {
            "vertices": [0.1, 0, 0, 1.1, 0, 0, 0.1, 1, 0],
            "normals": [0, 0, 1, 0, 0, 1, 0, 0, 1],
            "indices": [0, 1, 2]
        }
        
        # Mock point cloud and distance computation
        mock_pcd = MagicMock()
        mock_pcd.compute_point_cloud_distance.return_value = [0.1, 0.1, 0.14]
        mock_pointcloud_class.return_value = mock_pcd
        
        # Calculate distances
        result = main.calculate_mesh_distance(mesh_data_a, mesh_data_b)
        
        # Verify result
        self.assertNotIn("error", result)
        self.assertIn("min", result)
        self.assertIn("max", result)
        self.assertIn("mean", result)
        self.assertIn("std", result)
        self.assertIn("distances", result)


if __name__ == '__main__':
    unittest.main()