import numpy as np
import os
import json
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, classification_report
import warnings
warnings.filterwarnings('ignore')

DATA_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'my_data'
)
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'frontend', 'public', 'model'
)

def load_my_data():
    print('Loading your personal hand data...')
    X = []
    y = []
    signs = sorted([d for d in os.listdir(DATA_DIR)
        if os.path.isdir(os.path.join(DATA_DIR, d))])
    print('Found signs: ' + str(signs))
    for sign in signs:
        sign_path = os.path.join(DATA_DIR, sign)
        files = [f for f in os.listdir(sign_path)
                 if f.endswith('.npy')]
        for f in files:
            landmarks = np.load(os.path.join(sign_path, f))
            X.append(landmarks)
            y.append(sign)
            noise = landmarks + np.random.normal(
                0, 0.003, landmarks.shape
            )
            X.append(noise.astype(np.float32))
            y.append(sign)
        print('  ' + sign + ': ' + str(len(files)) + ' samples')
    print('Total: ' + str(len(X)) + ' samples')
    return np.array(X), np.array(y)

def train_and_export(X, y):
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded,
        test_size=0.2,
        random_state=42,
        stratify=y_encoded
    )
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)
    print('Training on YOUR data...')
    clf = MLPClassifier(
        hidden_layer_sizes=(256, 128, 64),
        activation='relu',
        solver='adam',
        alpha=0.001,
        max_iter=1000,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.15,
        verbose=True
    )
    clf.fit(X_train_s, y_train)
    y_pred = clf.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    print('ACCURACY: ' + str(round(acc * 100, 2)) + '%')
    print(classification_report(
        y_test, y_pred, target_names=le.classes_
    ))
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    scaler_data = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist()
    }
    with open(os.path.join(OUTPUT_DIR, 'scaler.json'), 'w') as f:
        json.dump(scaler_data, f)
    classes = le.classes_.tolist()
    mapping = {str(i): c for i, c in enumerate(classes)}
    with open(os.path.join(OUTPUT_DIR, 'label_encoder.json'), 'w') as f:
        json.dump({"classes": classes, "mapping": mapping}, f)
    n_inputs = 63
    n_classes = len(classes)
    layer_sizes = [n_inputs] + list(clf.hidden_layer_sizes) + [n_classes]
    weight_specs = []
    for i in range(len(clf.coefs_)):
        weight_specs.append({
            "name": "dense_" + str(i) + "/kernel",
            "shape": [layer_sizes[i], layer_sizes[i+1]],
            "dtype": "float32"
        })
        weight_specs.append({
            "name": "dense_" + str(i) + "/bias",
            "shape": [layer_sizes[i+1]],
            "dtype": "float32"
        })
    activations = ['relu'] * (len(clf.coefs_) - 1) + ['softmax']
    layers = []
    for i in range(len(clf.coefs_)):
        config = {
            "name": "dense_" + str(i),
            "trainable": True,
            "units": layer_sizes[i+1],
            "activation": activations[i],
            "use_bias": True
        }
        if i == 0:
            config["batch_input_shape"] = [None, n_inputs]
        layers.append({"class_name": "Dense", "config": config})
    model_json = {
        "format": "layers-model",
        "generatedBy": "SignMeet-PersonalTrainer",
        "convertedBy": None,
        "modelTopology": {
            "class_name": "Sequential",
            "config": {"name": "personal_asl_model", "layers": layers}
        },
        "weightsManifest": [{
            "paths": ["weights.bin"],
            "weights": weight_specs
        }]
    }
    with open(os.path.join(OUTPUT_DIR, 'model.json'), 'w') as f:
        json.dump(model_json, f, indent=2)
    with open(os.path.join(OUTPUT_DIR, 'weights.bin'), 'wb') as f:
        for coef in clf.coefs_:
            f.write(coef.astype(np.float32).tobytes())
        for intercept in clf.intercepts_:
            f.write(intercept.astype(np.float32).tobytes())
    print('Model saved to: ' + OUTPUT_DIR)
    print('Accuracy: ' + str(round(acc * 100, 2)) + '%')

if __name__ == '__main__':
    print('=' * 50)
    print('Personal ASL Model Training')
    print('Training on YOUR hand data')
    print('=' * 50)
    if not os.path.exists(DATA_DIR):
        print('No data found! Run collect_data.py first')
        exit(1)
    X, y = load_my_data()
    if len(X) < 50:
        print('Not enough data! Need at least 50 samples')
        print('Run collect_data.py to collect more data')
        exit(1)
    train_and_export(X, y)
    print('Done! Restart React app to use new model')
