# Plot OpenFOAM Residuals

A Streamlit application to visualize OpenFOAM residuals from `residual.dat` files.

[Demo Application](https://bit.ly/plot-of-residuals)

## Features

- **Interactive Plots**: Visualize residuals using Altair for interactive exploration.
- **Static Plots**: Generate high-quality static plots using Matplotlib.
- **Data Inspection**: View raw data in a tabular format.
- **Multiple Files**: Upload and compare multiple residual files simultaneously.
- **Log Scale**: Automatically plots residuals on a logarithmic scale.

## Installation

This project uses `uv` for dependency management.

1.  **Install uv**:
    ```bash
    curl -LsSf https://astral.sh/uv/install.sh | sh
    ```

2.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd Plot-OpenFOAM-Residuals
    ```

3.  **Install dependencies**:
    ```bash
    uv sync
    ```

## Usage

Run the Streamlit application:

```bash
uv run streamlit run streamlit_app.py
```

Open your browser and navigate to the URL provided in the terminal (usually `http://localhost:8501`).

## How to Use

1.  **Upload Files**: Drag and drop your `residual.dat` files into the file uploader. These files are typically found in the `postProcessing` directory of your OpenFOAM case.
2.  **Adjust Settings**: Use the sidebar to change the figure width and height for Matplotlib plots.
3.  **Explore**: Switch between the "Altair", "Matplotlib", and "Dataframe" tabs to view the data in different formats.
