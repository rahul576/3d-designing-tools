# Photo cut-out model

These files let the Photo Frame Generator find the person (or pet) in a photo, entirely in the browser. Nothing is uploaded.

- `vision_bundle.mjs`, `vision_wasm_internal.js`, `vision_wasm_internal.wasm`: MediaPipe Tasks Vision 1.2.0 (`@mediapipe/tasks-vision` on npm), Apache License 2.0, © Google LLC.
- `deeplab_v3.tflite`: MediaPipe DeepLab v3 image segmentation model (from storage.googleapis.com/mediapipe-models), Apache License 2.0.

They are only loaded the first time someone picks the *Photo cut-out* opening shape.

The full licence text is in `LICENSE-APACHE-2.0.txt`.
