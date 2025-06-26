import eel
import os
import json
import struct
import tempfile
import traceback
from pathlib import Path
import numpy as np

# Initialize Eel with the web folder
eel.init('web')

# Ensure temp directory exists
TEMP_DIR = Path('temp')
TEMP_DIR.mkdir(exist_ok=True)

@eel.expose
def save_uploaded_file(file_content, filename):
    """Save uploaded file content to temporary location"""
    try:
        # Create a temporary file path
        temp_path = TEMP_DIR / filename
        
        # Write the file content
        with open(temp_path, 'wb') as f:
            # Convert from base64 if needed
            import base64
            if isinstance(file_content, str):
                file_data = base64.b64decode(file_content)
            else:
                file_data = bytes(file_content)
            f.write(file_data)
        
        return {"success": True, "path": str(temp_path)}
    except Exception as e:
        return {"error": f"File save error: {str(e)}"}

@eel.expose
def process_3d_file(file_path, file_id):
    """Process various 3D file formats and return mesh data for Three.js"""
    try:
        file_path = Path(file_path)
        file_ext = file_path.suffix.lower()
        
        # Direct STL processing
        if file_ext == '.stl':
            mesh_data = read_stl_to_json(str(file_path))
            
            # Clean up original file if it's in temp directory
            if file_path.parent == TEMP_DIR:
                file_path.unlink()
            
            return mesh_data
        
        # OBJ file processing
        elif file_ext == '.obj':
            mesh_data = read_obj_to_json(str(file_path))
            
            # Clean up original file if it's in temp directory
            if file_path.parent == TEMP_DIR:
                file_path.unlink()
            
            return mesh_data
        
        # STEP/IGES processing with CadQuery
        elif file_ext in ['.step', '.stp', '.iges', '.igs']:
            import cadquery as cq
            
            # Read file based on format
            if file_ext in ['.step', '.stp']:
                result = cq.importers.importStep(str(file_path))
            else:  # IGES
                # Try to import IGES - note: CadQuery might have limited IGES support
                try:
                    result = cq.importers.importStep(str(file_path))  # Some IGES files can be read as STEP
                except:
                    # If CadQuery fails, we'll need to handle it differently
                    return {"error": "IGES format is not fully supported. Please convert to STEP or STL format."}
            
            # Export to STL
            stl_path = TEMP_DIR / f"{file_id}.stl"
            cq.exporters.export(result, str(stl_path))
            
            # Read STL and convert to mesh data
            mesh_data = read_stl_to_json(str(stl_path))
            
            # Clean up temp file
            if stl_path.exists():
                stl_path.unlink()
            
            # Clean up original file if it's in temp directory
            if file_path.parent == TEMP_DIR:
                file_path.unlink()
            
            return mesh_data
        
        else:
            return {"error": f"Unsupported file format: {file_ext}"}
        
    except Exception as e:
        return {"error": f"Processing error: {str(e)}\n{traceback.format_exc()}"}

@eel.expose
def read_stl_to_json(stl_path):
    """Read STL file and convert to Three.js compatible JSON format"""
    try:
        import open3d as o3d
        
        # Read STL file
        mesh = o3d.io.read_triangle_mesh(stl_path)
        
        # Open3D optimization pipeline
        # 1. Remove duplicate vertices
        mesh.remove_duplicated_vertices()
        
        # 2. Remove duplicate triangles
        mesh.remove_duplicated_triangles()
        
        # 3. Remove degenerate triangles (triangles with zero area)
        mesh.remove_degenerate_triangles()
        
        # 4. Remove unreferenced vertices
        mesh.remove_unreferenced_vertices()
        
        # 5. Ensure mesh has vertex normals
        if not mesh.has_vertex_normals():
            mesh.compute_vertex_normals()
        
        # 6. Orient triangles consistently
        mesh.orient_triangles()
        
        # Convert to numpy arrays
        vertices = np.asarray(mesh.vertices).flatten().tolist()
        normals = np.asarray(mesh.vertex_normals).flatten().tolist()
        triangles = np.asarray(mesh.triangles).flatten().tolist()
        
        return {
            "vertices": vertices,
            "normals": normals,
            "indices": triangles
        }
        
    except Exception as e:
        # Fallback to manual STL reading if Open3D fails
        return read_stl_manual(stl_path)

def read_stl_manual(stl_path):
    """Manual STL reader as fallback"""
    vertices = []
    normals = []
    indices = []
    vertex_map = {}
    
    try:
        with open(stl_path, 'rb') as f:
            # Skip header (80 bytes)
            f.read(80)
            
            # Read number of triangles
            num_triangles = int.from_bytes(f.read(4), 'little')
            
            for i in range(num_triangles):
                # Read normal (3 floats)
                normal = struct.unpack('<fff', f.read(12))
                
                # Read 3 vertices
                for j in range(3):
                    vertex = struct.unpack('<fff', f.read(12))
                    
                    # Create unique vertex key
                    vertex_key = tuple(vertex)
                    
                    if vertex_key not in vertex_map:
                        vertex_map[vertex_key] = len(vertices) // 3
                        vertices.extend(vertex)
                        normals.extend(normal)
                    
                    indices.append(vertex_map[vertex_key])
                
                # Skip attribute byte count
                f.read(2)
        
        return {
            "vertices": vertices,
            "normals": normals,
            "indices": indices
        }
        
    except Exception as e:
        return {"error": f"STL reading error: {str(e)}"}

@eel.expose
def align_meshes(mesh_data_a, mesh_data_b):
    """Align two meshes using ICP algorithm"""
    try:
        import open3d as o3d
        
        # Convert mesh data to Open3D format
        def data_to_o3d_mesh(data):
            mesh = o3d.geometry.TriangleMesh()
            vertices = np.array(data['vertices']).reshape(-1, 3)
            triangles = np.array(data['indices']).reshape(-1, 3)
            mesh.vertices = o3d.utility.Vector3dVector(vertices)
            mesh.triangles = o3d.utility.Vector3iVector(triangles)
            mesh.compute_vertex_normals()
            return mesh
        
        mesh_a = data_to_o3d_mesh(mesh_data_a)
        mesh_b = data_to_o3d_mesh(mesh_data_b)
        
        # Sample points from meshes for ICP
        pcd_a = mesh_a.sample_points_uniformly(number_of_points=5000)
        pcd_b = mesh_b.sample_points_uniformly(number_of_points=5000)
        
        # Perform ICP
        threshold = 0.02
        trans_init = np.eye(4)
        
        reg_result = o3d.pipelines.registration.registration_icp(
            pcd_b, pcd_a, threshold, trans_init,
            o3d.pipelines.registration.TransformationEstimationPointToPoint()
        )
        
        # Apply transformation to mesh B
        mesh_b.transform(reg_result.transformation)
        
        # Convert back to JSON format
        aligned_vertices = np.asarray(mesh_b.vertices).flatten().tolist()
        aligned_normals = np.asarray(mesh_b.vertex_normals).flatten().tolist()
        
        return {
            "vertices": aligned_vertices,
            "normals": aligned_normals,
            "indices": mesh_data_b['indices'],
            "transformation": reg_result.transformation.tolist()
        }
        
    except Exception as e:
        return {"error": f"Alignment error: {str(e)}"}

@eel.expose
def read_obj_to_json(obj_path):
    """Read OBJ file and convert to Three.js compatible JSON format"""
    try:
        vertices = []
        normals = []
        faces = []
        vertex_normals = []
        
        with open(obj_path, 'r') as f:
            temp_normals = []
            
            for line in f:
                if line.startswith('v '):
                    # Vertex
                    parts = line.strip().split()
                    vertices.extend([float(parts[1]), float(parts[2]), float(parts[3])])
                    
                elif line.startswith('vn '):
                    # Vertex normal
                    parts = line.strip().split()
                    temp_normals.append([float(parts[1]), float(parts[2]), float(parts[3])])
                    
                elif line.startswith('f '):
                    # Face
                    parts = line.strip().split()[1:]
                    face_indices = []
                    
                    for part in parts:
                        # Parse vertex/texture/normal indices
                        indices = part.split('/')
                        vertex_idx = int(indices[0]) - 1  # OBJ indices are 1-based
                        face_indices.append(vertex_idx)
                        
                        # Handle normal index if present
                        if len(indices) >= 3 and indices[2]:
                            normal_idx = int(indices[2]) - 1
                            # Ensure we have enough space in vertex_normals
                            while len(vertex_normals) <= vertex_idx * 3 + 2:
                                vertex_normals.append(0)
                            # Copy normal to vertex normal array
                            vertex_normals[vertex_idx * 3] = temp_normals[normal_idx][0]
                            vertex_normals[vertex_idx * 3 + 1] = temp_normals[normal_idx][1]
                            vertex_normals[vertex_idx * 3 + 2] = temp_normals[normal_idx][2]
                    
                    # Triangulate faces if needed
                    if len(face_indices) == 3:
                        faces.extend(face_indices)
                    elif len(face_indices) == 4:
                        # Convert quad to two triangles
                        faces.extend([face_indices[0], face_indices[1], face_indices[2]])
                        faces.extend([face_indices[0], face_indices[2], face_indices[3]])
                    else:
                        # Fan triangulation for polygons
                        for i in range(1, len(face_indices) - 1):
                            faces.extend([face_indices[0], face_indices[i], face_indices[i + 1]])
        
        # If no normals were provided, use Open3D to compute them
        if not vertex_normals:
            import open3d as o3d
            
            mesh = o3d.geometry.TriangleMesh()
            mesh.vertices = o3d.utility.Vector3dVector(np.array(vertices).reshape(-1, 3))
            mesh.triangles = o3d.utility.Vector3iVector(np.array(faces).reshape(-1, 3))
            mesh.compute_vertex_normals()
            
            vertex_normals = np.asarray(mesh.vertex_normals).flatten().tolist()
        
        return {
            "vertices": vertices,
            "normals": vertex_normals,
            "indices": faces
        }
        
    except Exception as e:
        # Fallback to Open3D if manual parsing fails
        try:
            import open3d as o3d
            mesh = o3d.io.read_triangle_mesh(obj_path)
            
            if not mesh.has_vertex_normals():
                mesh.compute_vertex_normals()
            
            vertices = np.asarray(mesh.vertices).flatten().tolist()
            normals = np.asarray(mesh.vertex_normals).flatten().tolist()
            triangles = np.asarray(mesh.triangles).flatten().tolist()
            
            return {
                "vertices": vertices,
                "normals": normals,
                "indices": triangles
            }
        except Exception as e2:
            return {"error": f"OBJ reading error: {str(e)} / {str(e2)}"}

@eel.expose
def calculate_mesh_distance(mesh_data_a, mesh_data_b):
    """Calculate distance statistics between two meshes"""
    try:
        import open3d as o3d
        
        # Convert to numpy arrays
        vertices_a = np.array(mesh_data_a['vertices']).reshape(-1, 3)
        vertices_b = np.array(mesh_data_b['vertices']).reshape(-1, 3)
        
        # Create point clouds
        pcd_a = o3d.geometry.PointCloud()
        pcd_a.points = o3d.utility.Vector3dVector(vertices_a)
        
        pcd_b = o3d.geometry.PointCloud()
        pcd_b.points = o3d.utility.Vector3dVector(vertices_b)
        
        # Compute distances
        distances = pcd_a.compute_point_cloud_distance(pcd_b)
        distances = np.array(distances)
        
        return {
            "min": float(np.min(distances)),
            "max": float(np.max(distances)),
            "mean": float(np.mean(distances)),
            "std": float(np.std(distances)),
            "distances": distances.tolist()[:1000]  # Limit for performance
        }
        
    except Exception as e:
        return {"error": f"Distance calculation error: {str(e)}"}

@eel.expose
def find_matching_vertices(mesh_data_a, mesh_data_b, threshold=0.1):
    """Find matching vertices between two meshes within a distance threshold"""
    try:
        import open3d as o3d
        from scipy.spatial import KDTree
        
        # Convert to numpy arrays
        vertices_a = np.array(mesh_data_a['vertices']).reshape(-1, 3)
        vertices_b = np.array(mesh_data_b['vertices']).reshape(-1, 3)
        
        # Build KDTree for efficient nearest neighbor search
        tree_b = KDTree(vertices_b)
        
        # Find nearest neighbors for each vertex in A
        distances_a, indices_a = tree_b.query(vertices_a)
        matching_a = distances_a <= threshold
        
        # Build KDTree for mesh A
        tree_a = KDTree(vertices_a)
        
        # Find nearest neighbors for each vertex in B
        distances_b, indices_b = tree_a.query(vertices_b)
        matching_b = distances_b <= threshold
        
        # Calculate matching statistics
        num_matching_a = int(np.sum(matching_a))
        num_matching_b = int(np.sum(matching_b))
        percent_matching_a = float(num_matching_a / len(vertices_a) * 100)
        percent_matching_b = float(num_matching_b / len(vertices_b) * 100)
        
        return {
            "matching_vertices_a": matching_a.tolist(),
            "matching_vertices_b": matching_b.tolist(),
            "stats": {
                "num_matching_a": num_matching_a,
                "num_matching_b": num_matching_b,
                "percent_matching_a": percent_matching_a,
                "percent_matching_b": percent_matching_b,
                "total_vertices_a": len(vertices_a),
                "total_vertices_b": len(vertices_b)
            }
        }
        
    except Exception as e:
        return {"error": f"Matching calculation error: {str(e)}"}

# Start the Eel application
if __name__ == '__main__':
    # Set web files folder
    eel.start('index.html', 
              size=(1200, 800),
              port=8080,
              host='localhost',
              close_callback=lambda: print("Window closed"))
