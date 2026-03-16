# Sign Language Model Training

## What This Does
Trains a 50KB MLP model to detect 5 ISL signs:
HELLO, THANKS, BYE, YES, NO

## How To Run

Step 1 - Create virtual environment:
    cd train_model
    python -m venv venv
    venv\Scripts\activate

Step 2 - Install dependencies:
    pip install -r requirements.txt

Step 3 - Run training:
    python train.py

Step 4 - Verify output files:
    ../frontend/public/model/model.json
    ../frontend/public/model/weights.bin
    ../frontend/public/model/label_encoder.json
    ../frontend/public/model/scaler.json
    ../frontend/public/model/confusion_matrix.png

## Output Files Explained

model.json
  TF.js LayersModel architecture and weight manifest
  Loaded in browser with tf.loadLayersModel()

weights.bin
  Binary file containing all model weights
  Float32 values packed in little-endian order

label_encoder.json
  Maps model output index to sign name
  Example: {"0": "BYE", "1": "HELLO", ...}

scaler.json
  Mean and scale values for StandardScaler
  Applied to landmarks before model prediction

confusion_matrix.png
  Visual showing which signs get confused
  Good model shows dark diagonal, light elsewhere

## Expected Results
Accuracy: 90 percent or higher
Training time: under 60 seconds
Model size: under 100KB total
