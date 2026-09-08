# Minimap

Square Canvas2D overview of the actual square map. Combines terrain/scenery, observed gameplay entities, fog, territory and the camera's ground footprint. Drag pans the camera. Game places the minimap inside the command HUD; Editor uses the same module with authored spawn markers.

Entity ownership and presentation come from definition-backed observation data. Hidden live enemy positions are not a minimap source. The separate clock indicator follows the renderer's environment state.
