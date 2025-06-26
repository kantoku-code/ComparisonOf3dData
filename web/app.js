// Three.js scene setup
let scene, camera, renderer, controls;
let meshA = null, meshB = null;
let meshDataA = null, meshDataB = null;
let matchingDataA = null, matchingDataB = null;
let matchingMeshA = null, matchingMeshB = null;
let originalMaterialA = null, originalMaterialB = null;
const defaultCameraPosition = { x: 100, y: 100, z: 100 };

// Initialize Three.js
function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
    );
    camera.position.set(defaultCameraPosition.x, defaultCameraPosition.y, defaultCameraPosition.z);
    
    // Renderer
    const container = document.getElementById('viewer');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(100, 100, 50);
    scene.add(directionalLight);
    
    // Grid
    const gridHelper = new THREE.GridHelper(200, 20);
    scene.add(gridHelper);
    
    // Axes
    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewer');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Create mesh from data
function createMeshFromData(meshData, color, fileId) {
    const geometry = new THREE.BufferGeometry();
    
    // Set vertices
    const vertices = new Float32Array(meshData.vertices);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    // Set normals
    const normals = new Float32Array(meshData.normals);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    
    // Set indices
    const indices = new Uint32Array(meshData.indices);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    
    // Compute bounds
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    // Create material
    const material = new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        vertexColors: false
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = fileId;
    
    return mesh;
}

// Update mesh visibility
function updateMeshVisibility() {
    if (meshA) meshA.visible = document.getElementById('showFileA').checked;
    if (meshB) meshB.visible = document.getElementById('showFileB').checked;
}

// Update opacity
function updateOpacity() {
    const opacity = document.getElementById('opacity').value / 100;
    document.getElementById('opacityValue').textContent = `${document.getElementById('opacity').value}%`;
    
    if (meshA && meshA.material) meshA.material.opacity = opacity;
    if (meshB && meshB.material) meshB.material.opacity = opacity;
}

// Update wireframe
function updateWireframe() {
    const wireframe = document.getElementById('wireframe').checked;
    
    if (meshA && meshA.material) meshA.material.wireframe = wireframe;
    if (meshB && meshB.material) meshB.material.wireframe = wireframe;
}

// Reset view
function resetView() {
    camera.position.set(defaultCameraPosition.x, defaultCameraPosition.y, defaultCameraPosition.z);
    controls.reset();
}

// Center and scale mesh
function centerAndScaleMesh(mesh) {
    // Center the mesh
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.sub(center);
    
    // Scale to fit
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 100 / maxDim;
    mesh.scale.multiplyScalar(scale);
}

// Show status message
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    if (type !== 'error') {
        setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
        }, 3000);
    }
}

// Show loading
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// File drop handling
function setupDropZones() {
    const dropZoneA = document.getElementById('dropZoneA');
    const dropZoneB = document.getElementById('dropZoneB');
    
    [dropZoneA, dropZoneB].forEach((zone, index) => {
        const fileId = index === 0 ? 'A' : 'B';
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                const filename = file.name.toLowerCase();
                const supportedFormats = ['.step', '.stp', '.iges', '.igs', '.stl', '.obj'];
                
                if (supportedFormats.some(ext => filename.endsWith(ext))) {
                    // Hide drop content when file is being processed
                    zone.querySelector('.drop-content').style.display = 'none';
                    await handleFileUpload(file, fileId);
                } else {
                    showStatus('対応フォーマット: STEP, IGES, STL, OBJ', 'error');
                }
            }
        });
    });
}

// Handle file upload
async function handleFileUpload(file, fileId) {
    showLoading(true);
    showStatus(`${file.name} を処理中...`);
    
    try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            // Convert to base64
            const arrayBuffer = e.target.result;
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Content = btoa(binary);
            
            // Save file on server
            const saveResult = await eel.save_uploaded_file(base64Content, file.name)();
            
            if (saveResult.error) {
                showStatus(`ファイル保存エラー: ${saveResult.error}`, 'error');
                showLoading(false);
                return;
            }
            
            // Process 3D file with full path
            const result = await eel.process_3d_file(saveResult.path, fileId)();
            
            if (result.error) {
                showStatus(`エラー: ${result.error}`, 'error');
                showLoading(false);
                return;
            }
            
            // Update file info
            const fileInfo = document.getElementById(`fileInfo${fileId}`);
            fileInfo.textContent = file.name;
            fileInfo.style.display = 'block';
            
            // Show clear button
            document.getElementById(`clearBtn${fileId}`).style.display = 'flex';
            
            // Remove old mesh if exists
            if (fileId === 'A' && meshA) {
                scene.remove(meshA);
                meshA.geometry.dispose();
                meshA.material.dispose();
            } else if (fileId === 'B' && meshB) {
                scene.remove(meshB);
                meshB.geometry.dispose();
                meshB.material.dispose();
            }
            
            // Create new mesh
            const color = fileId === 'A' ? 0xFF4444 : 0x4444FF;
            const mesh = createMeshFromData(result, color, fileId);
            centerAndScaleMesh(mesh);
            scene.add(mesh);
            
            // Store mesh and data
            if (fileId === 'A') {
                meshA = mesh;
                meshDataA = result;
                originalMaterialA = mesh.material.clone();
            } else {
                meshB = mesh;
                meshDataB = result;
                originalMaterialB = mesh.material.clone();
            }
            
            // Update UI
            updateMeshVisibility();
            updateOpacity();
            updateWireframe();
            
            // Enable buttons if both files loaded
            if (meshA && meshB) {
                document.getElementById('alignBtn').disabled = false;
                document.getElementById('calculateDistanceBtn').disabled = false;
                document.getElementById('findMatchingBtn').disabled = false;
            }
            
            showStatus(`${file.name} を読み込みました`, 'success');
        };
        
        reader.readAsArrayBuffer(file);
        
    } catch (error) {
        showStatus(`エラー: ${error.message}`, 'error');
        // Show drop content again on error
        const zone = document.getElementById(`dropZone${fileId}`);
        zone.querySelector('.drop-content').style.display = 'block';
    } finally {
        showLoading(false);
    }
}

// Align meshes
async function alignMeshes() {
    if (!meshDataA || !meshDataB) return;
    
    showLoading(true);
    showStatus('メッシュを位置合わせ中...');
    
    try {
        const result = await eel.align_meshes(meshDataA, meshDataB)();
        
        if (result.error) {
            showStatus(`位置合わせエラー: ${result.error}`, 'error');
            return;
        }
        
        // Update mesh B with aligned data
        scene.remove(meshB);
        meshB.geometry.dispose();
        
        meshB = createMeshFromData(result, 0x4444FF, 'B');
        scene.add(meshB);
        meshDataB = result;
        
        updateMeshVisibility();
        updateOpacity();
        updateWireframe();
        
        showStatus('位置合わせが完了しました', 'success');
        
    } catch (error) {
        showStatus(`エラー: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Calculate distance
async function calculateDistance() {
    if (!meshDataA || !meshDataB) return;
    
    showLoading(true);
    showStatus('距離を計算中...');
    
    try {
        const result = await eel.calculate_mesh_distance(meshDataA, meshDataB)();
        
        if (result.error) {
            showStatus(`距離計算エラー: ${result.error}`, 'error');
            return;
        }
        
        // Display statistics
        const statsContent = document.getElementById('statsContent');
        statsContent.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">最小距離:</span>
                <span class="stat-value">${result.min.toFixed(3)} mm</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">最大距離:</span>
                <span class="stat-value">${result.max.toFixed(3)} mm</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">平均距離:</span>
                <span class="stat-value">${result.mean.toFixed(3)} mm</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">標準偏差:</span>
                <span class="stat-value">${result.std.toFixed(3)} mm</span>
            </div>
        `;
        
        document.getElementById('statistics').style.display = 'block';
        showStatus('距離計算が完了しました', 'success');
        
    } catch (error) {
        showStatus(`エラー: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Find matching vertices
async function findMatching() {
    if (!meshDataA || !meshDataB) return;
    
    showLoading(true);
    showStatus('一致部分を検出中...');
    
    try {
        const threshold = parseFloat(document.getElementById('matchingThreshold').value);
        const result = await eel.find_matching_vertices(meshDataA, meshDataB, threshold)();
        
        if (result.error) {
            showStatus(`エラー: ${result.error}`, 'error');
            return;
        }
        
        // Store matching data
        matchingDataA = result.matching_vertices_a;
        matchingDataB = result.matching_vertices_b;
        
        // Update matching visualization if enabled
        if (document.getElementById('showMatching').checked) {
            updateMatchingVisualization();
        }
        
        // Display statistics
        const statsContent = document.getElementById('statsContent');
        statsContent.innerHTML += `
            <hr>
            <h4>一致部分統計</h4>
            <div class="stat-item">
                <span class="stat-label">File A 一致頂点:</span>
                <span class="stat-value">${result.stats.num_matching_a} / ${result.stats.total_vertices_a} (${result.stats.percent_matching_a.toFixed(1)}%)</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">File B 一致頂点:</span>
                <span class="stat-value">${result.stats.num_matching_b} / ${result.stats.total_vertices_b} (${result.stats.percent_matching_b.toFixed(1)}%)</span>
            </div>
        `;
        document.getElementById('statistics').style.display = 'block';
        
        showStatus('一致部分の検出が完了しました', 'success');
        
    } catch (error) {
        showStatus(`エラー: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Update matching visualization
function updateMatchingVisualization() {
    if (!matchingDataA || !matchingDataB) return;
    
    const showMatching = document.getElementById('showMatching').checked;
    
    // Remove existing matching meshes
    if (matchingMeshA) {
        scene.remove(matchingMeshA);
        matchingMeshA.geometry.dispose();
        matchingMeshA.material.dispose();
        if (matchingMeshA.matchingOnly) {
            scene.remove(matchingMeshA.matchingOnly);
            matchingMeshA.matchingOnly.geometry.dispose();
            matchingMeshA.matchingOnly.material.dispose();
        }
        matchingMeshA = null;
    }
    if (matchingMeshB) {
        scene.remove(matchingMeshB);
        matchingMeshB.geometry.dispose();
        matchingMeshB.material.dispose();
        if (matchingMeshB.matchingOnly) {
            scene.remove(matchingMeshB.matchingOnly);
            matchingMeshB.matchingOnly.geometry.dispose();
            matchingMeshB.matchingOnly.material.dispose();
        }
        matchingMeshB = null;
    }
    
    if (showMatching) {
        // Create matching mesh for A
        if (meshA && matchingDataA) {
            const originalGeometry = meshA.geometry;
            const matchingGeometry = new THREE.BufferGeometry();
            
            // Copy attributes
            matchingGeometry.setAttribute('position', originalGeometry.attributes.position.clone());
            matchingGeometry.setAttribute('normal', originalGeometry.attributes.normal.clone());
            matchingGeometry.setIndex(originalGeometry.index.clone());
            
            // Create vertex colors
            const vertexCount = originalGeometry.attributes.position.count;
            const colors = new Float32Array(vertexCount * 3);
            
            for (let i = 0; i < vertexCount; i++) {
                if (matchingDataA[i]) {
                    // Bright green for matching vertices
                    colors[i * 3] = 0.4;
                    colors[i * 3 + 1] = 1;
                    colors[i * 3 + 2] = 0.4;
                } else {
                    // Red for non-matching vertices
                    colors[i * 3] = 1;
                    colors[i * 3 + 1] = 0.267;
                    colors[i * 3 + 2] = 0.267;
                }
            }
            
            matchingGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            // Create material with vertex colors
            const matchingMaterial = new THREE.MeshLambertMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            
            matchingMeshA = new THREE.Mesh(matchingGeometry, matchingMaterial);
            matchingMeshA.position.copy(meshA.position);
            matchingMeshA.rotation.copy(meshA.rotation);
            matchingMeshA.scale.copy(meshA.scale);
            scene.add(matchingMeshA);
            
            // Hide original mesh
            meshA.visible = false;
        }
        
        // Create matching mesh for B
        if (meshB && matchingDataB) {
            const originalGeometry = meshB.geometry;
            const matchingGeometry = new THREE.BufferGeometry();
            
            // Copy attributes
            matchingGeometry.setAttribute('position', originalGeometry.attributes.position.clone());
            matchingGeometry.setAttribute('normal', originalGeometry.attributes.normal.clone());
            matchingGeometry.setIndex(originalGeometry.index.clone());
            
            // Create vertex colors
            const vertexCount = originalGeometry.attributes.position.count;
            const colors = new Float32Array(vertexCount * 3);
            
            for (let i = 0; i < vertexCount; i++) {
                if (matchingDataB[i]) {
                    // Bright green for matching vertices
                    colors[i * 3] = 0.4;
                    colors[i * 3 + 1] = 1;
                    colors[i * 3 + 2] = 0.4;
                } else {
                    // Blue for non-matching vertices
                    colors[i * 3] = 0.267;
                    colors[i * 3 + 1] = 0.267;
                    colors[i * 3 + 2] = 1;
                }
            }
            
            matchingGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            
            // Create material with vertex colors
            const matchingMaterial = new THREE.MeshLambertMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            
            matchingMeshB = new THREE.Mesh(matchingGeometry, matchingMaterial);
            matchingMeshB.position.copy(meshB.position);
            matchingMeshB.rotation.copy(meshB.rotation);
            matchingMeshB.scale.copy(meshB.scale);
            scene.add(matchingMeshB);
            
            // Hide original mesh
            meshB.visible = false;
        }
        
        // Create separate meshes for matching parts with 20% opacity
        if (meshA && matchingDataA) {
            const matchingIndices = [];
            const indices = meshA.geometry.index.array;
            
            // Find triangles where all vertices are matching
            for (let i = 0; i < indices.length; i += 3) {
                const v1 = indices[i];
                const v2 = indices[i + 1];
                const v3 = indices[i + 2];
                
                if (matchingDataA[v1] && matchingDataA[v2] && matchingDataA[v3]) {
                    matchingIndices.push(v1, v2, v3);
                }
            }
            
            if (matchingIndices.length > 0) {
                const matchingOnlyGeometry = new THREE.BufferGeometry();
                matchingOnlyGeometry.setAttribute('position', meshA.geometry.attributes.position.clone());
                matchingOnlyGeometry.setAttribute('normal', meshA.geometry.attributes.normal.clone());
                matchingOnlyGeometry.setIndex(matchingIndices);
                
                const matchingOnlyMaterial = new THREE.MeshLambertMaterial({
                    color: 0x66ff66,  // Bright green
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide
                });
                
                const matchingOnlyMesh = new THREE.Mesh(matchingOnlyGeometry, matchingOnlyMaterial);
                matchingOnlyMesh.position.copy(meshA.position);
                matchingOnlyMesh.rotation.copy(meshA.rotation);
                matchingOnlyMesh.scale.copy(meshA.scale);
                scene.add(matchingOnlyMesh);
                
                // Store reference for cleanup
                matchingMeshA.matchingOnly = matchingOnlyMesh;
            }
        }
        
        if (meshB && matchingDataB) {
            const matchingIndices = [];
            const indices = meshB.geometry.index.array;
            
            // Find triangles where all vertices are matching
            for (let i = 0; i < indices.length; i += 3) {
                const v1 = indices[i];
                const v2 = indices[i + 1];
                const v3 = indices[i + 2];
                
                if (matchingDataB[v1] && matchingDataB[v2] && matchingDataB[v3]) {
                    matchingIndices.push(v1, v2, v3);
                }
            }
            
            if (matchingIndices.length > 0) {
                const matchingOnlyGeometry = new THREE.BufferGeometry();
                matchingOnlyGeometry.setAttribute('position', meshB.geometry.attributes.position.clone());
                matchingOnlyGeometry.setAttribute('normal', meshB.geometry.attributes.normal.clone());
                matchingOnlyGeometry.setIndex(matchingIndices);
                
                const matchingOnlyMaterial = new THREE.MeshLambertMaterial({
                    color: 0x66ff66,  // Bright green
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.DoubleSide
                });
                
                const matchingOnlyMesh = new THREE.Mesh(matchingOnlyGeometry, matchingOnlyMaterial);
                matchingOnlyMesh.position.copy(meshB.position);
                matchingOnlyMesh.rotation.copy(meshB.rotation);
                matchingOnlyMesh.scale.copy(meshB.scale);
                scene.add(matchingOnlyMesh);
                
                // Store reference for cleanup
                matchingMeshB.matchingOnly = matchingOnlyMesh;
            }
        }
    } else {
        // Restore original meshes visibility
        if (meshA) meshA.visible = document.getElementById('showFileA').checked;
        if (meshB) meshB.visible = document.getElementById('showFileB').checked;
    }
}

// Toggle matching threshold visibility
function toggleMatchingThreshold() {
    const showMatching = document.getElementById('showMatching').checked;
    const thresholdGroup = document.getElementById('matchingThresholdGroup');
    
    thresholdGroup.style.display = showMatching ? 'block' : 'none';
    
    if (!showMatching) {
        // Restore original colors when unchecked
        updateMatchingVisualization();
    } else if (matchingDataA && matchingDataB) {
        // Apply matching colors if data exists
        updateMatchingVisualization();
    }
}

// Update threshold value display
function updateThresholdValue() {
    const value = document.getElementById('matchingThreshold').value;
    document.getElementById('thresholdValue').textContent = value;
}

// Clear file function
function clearFile(fileId) {
    // Remove mesh from scene
    if (fileId === 'A' && meshA) {
        scene.remove(meshA);
        meshA.geometry.dispose();
        meshA.material.dispose();
        meshA = null;
        meshDataA = null;
        originalMaterialA = null;
        matchingDataA = null;
    } else if (fileId === 'B' && meshB) {
        scene.remove(meshB);
        meshB.geometry.dispose();
        meshB.material.dispose();
        meshB = null;
        meshDataB = null;
        originalMaterialB = null;
        matchingDataB = null;
    }
    
    // Remove matching meshes if exist
    if (matchingMeshA || matchingMeshB) {
        updateMatchingVisualization();
    }
    
    // Reset UI
    const fileInfo = document.getElementById(`fileInfo${fileId}`);
    fileInfo.textContent = '';
    fileInfo.style.display = 'none';
    
    // Hide clear button
    document.getElementById(`clearBtn${fileId}`).style.display = 'none';
    
    // Update drop zone
    const dropZone = document.getElementById(`dropZone${fileId}`);
    dropZone.querySelector('.drop-content').style.display = 'block';
    
    // Disable buttons if needed
    if (!meshA || !meshB) {
        document.getElementById('alignBtn').disabled = true;
        document.getElementById('calculateDistanceBtn').disabled = true;
        document.getElementById('findMatchingBtn').disabled = true;
    }
    
    // Hide statistics if both files are cleared
    if (!meshA && !meshB) {
        document.getElementById('statistics').style.display = 'none';
    }
    
    showStatus(`File ${fileId} を削除しました`, 'info');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    setupDropZones();
    
    // Control event listeners
    document.getElementById('showFileA').addEventListener('change', updateMeshVisibility);
    document.getElementById('showFileB').addEventListener('change', updateMeshVisibility);
    document.getElementById('opacity').addEventListener('input', updateOpacity);
    document.getElementById('wireframe').addEventListener('change', updateWireframe);
    document.getElementById('showMatching').addEventListener('change', toggleMatchingThreshold);
    document.getElementById('matchingThreshold').addEventListener('input', updateThresholdValue);
    document.getElementById('resetViewBtn').addEventListener('click', resetView);
    document.getElementById('alignBtn').addEventListener('click', alignMeshes);
    document.getElementById('calculateDistanceBtn').addEventListener('click', calculateDistance);
    document.getElementById('findMatchingBtn').addEventListener('click', findMatching);
    
    // Clear button event listeners
    document.getElementById('clearBtnA').addEventListener('click', () => clearFile('A'));
    document.getElementById('clearBtnB').addEventListener('click', () => clearFile('B'));
});