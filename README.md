# Eddy3D Visualizer

[Visit the Website](https://viz.eddy3d.com/)

A web-based visualization tool for Eddy3D simulation results. This application allows users to upload CSV data and visualize 3D airflow/environmental patterns in interactively.

## Features

- **Data Import**: Upload `.csv` result files directly from the UI.
- **Interactive 3D View**:
  - **Perspective & Top Views**: Switch between perspective and orthographic top-down views.
  - **Auto-Rotation**: Automatically rotate the model for presentations.
  - **Grid & Geometry Controls**: Toggle visibility of the reference grid, building geometry, and edge outlines.
- **Visualization Settings**:
  - **Point Size Control**: Adjust the size of data points for better visibility.
  - **Colormaps**: Choose from scientific colormaps including **Turbo**, **Jet** (default), **Viridis**, **Inferno**, and **Magma**.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)

### Local Development

1.  Navigate to the `gui` directory:
    ```bash
    cd gui
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

4.  Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173/`).

## Building for Production

To create a production build:

```bash
cd gui
npm run build
```

The output will be in `gui/dist`.

## Deployment

This repository is configured to automatically deploy to **GitHub Pages**.

-   The configuration file can be found at `gui/vite.config.ts`.
-   The GitHub Actions workflow is located at `.github/workflows/deploy.yml`.

When changes are pushed to the `main` branch, the site is rebuilt and deployed to the `gh-pages` branch.