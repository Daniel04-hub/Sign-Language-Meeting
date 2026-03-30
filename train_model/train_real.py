import cv2
import numpy as np
import os
import json
import sys
import mediapipe as mp
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, classification_report
import warnings
warnings.filterwarnings('ignore')

SAMPLES_PER_SIGN = 300
OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', 'frontend', 'public', 'model'
)

mp_hands = mp.solutions.hands
hands_detector = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.3
)

def extract_landmarks(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_rgb = cv2.resize(img_rgb, (224, 224))
        results = hands_detector.process(img_rgb)
        if not results.multi_hand_landmarks:
            return None
        landmarks = results.multi_hand_landmarks[0].landmark
        wrist_x = landmarks[0].x
        wrist_y = landmarks[0].y
        wrist_z = landmarks[0].z
        features = []
        for lm in landmarks:
            features.extend([
                lm.x - wrist_x,
                lm.y - wrist_y,
                lm.z - wrist_z
            ])
        return np.array(features, dtype=np.float32)
    except Exception:
        return None

def load_dataset(dataset_path):
    print('Loading dataset from: ' + dataset_path)
    print('This may take 30 to 60 minutes...')
    print()
    signs = sorted(os.listdir(dataset_path))
    signs = [s for s in signs if os.path.isdir(
        os.path.join(dataset_path, s)
    )]
    print('Found ' + str(len(signs)) + ' sign classes')
    print('Classes: ' + str(signs))
    print()
    X = []
    y = []
    total_skipped = 0
    total_loaded = 0
    total_augmented = 0
    for sign in signs:
        sign_path = os.path.join(dataset_path, sign)
        images = [
            f for f in os.listdir(sign_path)
            if f.lower().endswith(('.jpg', '.jpeg', '.png'))
        ]
        np.random.shuffle(images)
        images = images[:SAMPLES_PER_SIGN]
        loaded = 0
        augmented = 0
        skipped = 0
        for img_file in images:
            img_path = os.path.join(sign_path, img_file)
            landmarks = extract_landmarks(img_path)
            if landmarks is not None:
                X.append(landmarks)
                y.append(sign)
                loaded += 1

                flipped = landmarks.copy()
                for i in range(21):
                    flipped[i * 3] = -flipped[i * 3]
                X.append(flipped.astype(np.float32))
                y.append(sign)

                noisy = landmarks + np.random.normal(0, 0.005, landmarks.shape)
                X.append(noisy.astype(np.float32))
                y.append(sign)
                augmented += 2
            else:
                skipped += 1
                total_skipped += 1
        total_loaded += loaded
        total_augmented += augmented
        print(
            '  ' + sign + ': ' + str(loaded) + ' loaded (+ '
            + str(augmented) + ' augmented = '
            + str(loaded + augmented) + ' total), '
            + str(skipped) + ' skipped'
        )
    print()
    print('Total original loaded: ' + str(total_loaded) + ' samples')
    print('Total augmented: ' + str(total_augmented) + ' samples')
    print('Total loaded: ' + str(len(X)) + ' samples')
    print('Total skipped: ' + str(total_skipped))
    print()
    return np.array(X), np.array(y)

def train(X, y):
    print('Encoding labels...')
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    print('Classes: ' + str(list(le.classes_)))
    print('Splitting data...')
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded,
        test_size=0.2,
        random_state=42,
        stratify=y_encoded
    )
    print('Train: ' + str(len(X_train)) + ' Test: ' + str(len(X_test)))
    print('Scaling features...')
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)
    print('Training MLP model...')
    clf = MLPClassifier(
        hidden_layer_sizes=(512, 256, 128, 64),
        activation='relu',
        solver='adam',
        alpha=0.0001,
        batch_size=64,
        learning_rate='adaptive',
        learning_rate_init=0.001,
        max_iter=1000,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=30,
        verbose=True
    )
    clf.fit(X_train_s, y_train)
    y_pred = clf.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    print()
    print('Accuracy: ' + str(round(acc * 100, 2)) + '%')
    print(classification_report(y_test, y_pred, target_names=le.classes_))
    return clf, scaler, le

def export(clf, scaler, le):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    scaler_data = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist()
    }
    with open(os.path.join(OUTPUT_DIR, 'scaler.json'), 'w') as f:
        json.dump(scaler_data, f)
    print('Saved scaler.json')
    classes = le.classes_.tolist()
    mapping = {str(i): c for i, c in enumerate(classes)}
    encoder_data = {"classes": classes, "mapping": mapping}
    with open(os.path.join(OUTPUT_DIR, 'label_encoder.json'), 'w') as f:
        json.dump(encoder_data, f)
    print('Saved label_encoder.json')
    n_inputs = 63
    n_classes = len(classes)
    layer_sizes = [n_inputs] + list(clf.hidden_layer_sizes) + [n_classes]
    weight_specs = []
    for i in range(len(clf.coefs_)):
        weight_specs.append({
            "name": "dense_" + str(i) + "/kernel",
            "shape": [layer_sizes[i], layer_sizes[i + 1]],
            "dtype": "float32"
        })
        weight_specs.append({
            "name": "dense_" + str(i) + "/bias",
            "shape": [layer_sizes[i + 1]],
            "dtype": "float32"
        })
    activations = ['relu'] * (len(clf.coefs_) - 1) + ['softmax']
    layers = []
    for i in range(len(clf.coefs_)):
        config = {
            "name": "dense_" + str(i),
            "trainable": True,
            "units": layer_sizes[i + 1],
            "activation": activations[i],
            "use_bias": True
        }
        if i == 0:
            config["batch_input_shape"] = [None, n_inputs]
        layers.append({"class_name": "Dense", "config": config})
    model_json = {
        "format": "layers-model",
        "generatedBy": "SignMeet-RealDataTrainer",
        "convertedBy": None,
        "modelTopology": {
            "class_name": "Sequential",
            "config": {"name": "asl_sign_model", "layers": layers}
        },
        "weightsManifest": [{"paths": ["weights.bin"], "weights": weight_specs}]
    }
    with open(os.path.join(OUTPUT_DIR, 'model.json'), 'w') as f:
        json.dump(model_json, f, indent=2)
    print('Saved model.json')
    weights_path = os.path.join(OUTPUT_DIR, 'weights.bin')
    with open(weights_path, 'wb') as f:
        for coef in clf.coefs_:
            f.write(coef.astype(np.float32).tobytes())
        for intercept in clf.intercepts_:
            f.write(intercept.astype(np.float32).tobytes())
    print('Saved weights.bin')
    print()
    print('All files saved to: ' + OUTPUT_DIR)

if __name__ == '__main__':
    print('=' * 50)
    print('ASL Sign Language Model Training')
    print('=' * 50)
    print()
    if len(sys.argv) > 1:
        dataset_path = sys.argv[1]
    else:
        try:
            import kagglehub
            print('Downloading dataset from Kaggle (5GB)...')
            print('This will take 15 to 20 minutes...')
            path = kagglehub.dataset_download(
                'debashishsau/aslamerican-sign-language-aplhabet-dataset'
            )
            print('Downloaded to: ' + path)
            dataset_path = None
            for root, dirs, files in os.walk(path):
                if 'asl_alphabet_train' in dirs:
                    dataset_path = os.path.join(root, 'asl_alphabet_train')
                    break
            if not dataset_path:
                dataset_path = path
        except Exception as e:
            print('Kaggle download failed: ' + str(e))
            sys.exit(1)
    if not os.path.exists(dataset_path):
        print('Dataset not found at: ' + dataset_path)
        sys.exit(1)
    print('Using dataset: ' + dataset_path)
    print('Samples per sign: ' + str(SAMPLES_PER_SIGN))
    print()
    X, y = load_dataset(dataset_path)
    clf, scaler, le = train(X, y)
    export(clf, scaler, le)
    print()
    print('=' * 50)
    print('Training complete!')
    print('Restart your React app to use the new model')
    print('=' * 50)
