# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a 3D CAD comparison desktop application that visualizes differences between two STEP CAD files. The application uses Python Eel for the desktop GUI, CadQuery for STEP file processing, Open3D for mesh optimization, and Three.js for 3D visualization.

## Development Commands

### Environment Setup
```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install eel cadquery open3d numpy
```

### Running the Application
```bash
python main.py
```

### Testing
```bash
# Run unit tests (when implemented)
python -m pytest tests/

# Run specific test file
python -m pytest tests/test_cad_processing.py
```

### Code Quality
```bash
# Format code with black
black .

# Lint with pylint
pylint main.py

# Type checking with mypy
mypy main.py
```

## Architecture

### Directory Structure
```
project/
├── main.py                 # Entry point - Eel application setup
├── web/                    # Frontend assets
│   ├── index.html         # Main UI with drag-and-drop zones
│   ├── app.js            # Three.js visualization and UI logic
│   └── style.css         # Styling
├── temp/                  # Temporary STL file storage
└── tests/                 # Unit tests
```

### Processing Pipeline
1. **STEP Input**: User drops STEP files via drag-and-drop UI
2. **CadQuery Processing**: Convert STEP to tessellated mesh
3. **STL Export**: Save as temporary STL files
4. **Open3D Optimization**: Clean mesh, remove duplicates, compute normals
5. **JSON Export**: Convert to Three.js-compatible format
6. **Three.js Rendering**: Display with color coding (File A: red, File B: blue)

### Key Components

**Backend (Python)**:
- `main.py`: Eel app initialization and exposed functions
- STEP file processing using CadQuery's `importers.importStep()`
- Mesh optimization with Open3D
- ICP alignment for automatic model registration

**Frontend (JavaScript)**:
- Three.js scene setup with OrbitControls
- File drag-and-drop handling with HTML5 File API
- Dynamic mesh loading and material assignment
- UI controls for transparency, visibility, and alignment

### Inter-Process Communication
- Eel provides the bridge between Python backend and JavaScript frontend
- Python functions exposed with `@eel.expose` decorator
- JavaScript calls Python functions via `eel.function_name()`
- Data exchange format: JSON for mesh data, file paths for processing

## Key Technical Details

- **Tessellation Precision**: Default 0.1 (adjustable for performance vs quality)
- **Color Scheme**: File A (#FF4444), File B (#4444FF)
- **Transparency Range**: 0.3 to 1.0
- **Temporary Files**: STL files stored in `temp/` directory
- **Memory Considerations**: Large STEP files (>100MB) may require optimization