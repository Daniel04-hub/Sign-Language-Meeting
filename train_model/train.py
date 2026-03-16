import numpy as np
import json
import os
import struct
import joblib
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)
import matplotlib.pyplot as plt
import seaborn as sns
import warnings
warnings.filterwarnings('ignore')

SIGN_LABELS = ['HELLO', 'THANKS', 'BYE', 'YES', 'NO']
SAMPLES_PER_SIGN = 300
NOISE_FACTOR = 0.02
RANDOM_STATE = 42
OUTPUT_DIR = '../frontend/public/model'
MODEL_FILE = 'model.json'
WEIGHTS_FILE = 'weights.bin'
LABEL_ENCODER_FILE = 'label_encoder.json'


def get_hello_landmarks():
    return [
        [0.0, 0.0, 0.0],
        [0.1, 0.1, 0.0],
        [0.15, 0.2, 0.0],
        [0.18, 0.3, 0.0],
        [0.2, 0.4, 0.0],
        [0.05, 0.3, 0.0],
        [0.05, 0.45, 0.0],
        [0.05, 0.55, 0.0],
        [0.05, 0.65, 0.0],
        [0.0, 0.32, 0.0],
        [0.0, 0.48, 0.0],
        [0.0, 0.58, 0.0],
        [0.0, 0.68, 0.0],
        [-0.05, 0.30, 0.0],
        [-0.05, 0.45, 0.0],
        [-0.05, 0.55, 0.0],
        [-0.05, 0.63, 0.0],
        [-0.1, 0.27, 0.0],
        [-0.1, 0.38, 0.0],
        [-0.1, 0.46, 0.0],
        [-0.1, 0.54, 0.0],
    ]


def get_thanks_landmarks():
    return [
        [0.0, 0.0, 0.0],
        [0.08, 0.08, 0.01],
        [0.12, 0.16, 0.01],
        [0.14, 0.24, 0.01],
        [0.15, 0.32, 0.01],
        [0.04, 0.28, 0.0],
        [0.04, 0.40, 0.0],
        [0.04, 0.48, 0.0],
        [0.04, 0.55, 0.0],
        [0.0, 0.30, 0.0],
        [0.0, 0.42, 0.0],
        [0.0, 0.50, 0.0],
        [0.0, 0.57, 0.0],
        [-0.04, 0.28, 0.0],
        [-0.04, 0.40, 0.0],
        [-0.04, 0.48, 0.0],
        [-0.04, 0.55, 0.0],
        [-0.08, 0.25, 0.0],
        [-0.08, 0.35, 0.0],
        [-0.08, 0.42, 0.0],
        [-0.08, 0.48, 0.0],
    ]


def get_bye_landmarks():
    return [
        [0.0, 0.0, 0.0],
        [0.12, 0.08, 0.02],
        [0.18, 0.15, 0.02],
        [0.22, 0.22, 0.02],
        [0.26, 0.28, 0.02],
        [0.06, 0.28, 0.01],
        [0.10, 0.42, 0.01],
        [0.12, 0.52, 0.01],
        [0.13, 0.62, 0.01],
        [0.0, 0.30, 0.0],
        [0.0, 0.45, 0.0],
        [0.0, 0.56, 0.0],
        [0.0, 0.66, 0.0],
        [-0.06, 0.28, 0.0],
        [-0.08, 0.42, 0.0],
        [-0.09, 0.52, 0.0],
        [-0.10, 0.62, 0.0],
        [-0.12, 0.25, 0.0],
        [-0.15, 0.36, 0.0],
        [-0.16, 0.44, 0.0],
        [-0.17, 0.52, 0.0],
    ]


def get_yes_landmarks():
    return [
        [0.0, 0.0, 0.0],
        [0.08, 0.06, 0.01],
        [0.10, 0.12, 0.02],
        [0.08, 0.18, 0.03],
        [0.06, 0.22, 0.04],
        [0.04, 0.22, 0.0],
        [0.04, 0.18, 0.05],
        [0.03, 0.14, 0.08],
        [0.02, 0.10, 0.09],
        [0.0, 0.24, 0.0],
        [0.0, 0.20, 0.05],
        [0.0, 0.15, 0.09],
        [0.0, 0.11, 0.10],
        [-0.04, 0.22, 0.0],
        [-0.04, 0.18, 0.05],
        [-0.03, 0.14, 0.08],
        [-0.02, 0.10, 0.09],
        [-0.08, 0.20, 0.0],
        [-0.07, 0.16, 0.04],
        [-0.06, 0.13, 0.07],
        [-0.05, 0.10, 0.08],
    ]


def get_no_landmarks():
    return [
        [0.0, 0.0, 0.0],
        [0.08, 0.06, 0.0],
        [0.10, 0.12, 0.01],
        [0.08, 0.16, 0.02],
        [0.06, 0.18, 0.03],
        [0.04, 0.22, 0.0],
        [0.04, 0.36, 0.0],
        [0.04, 0.46, 0.0],
        [0.04, 0.56, 0.0],
        [0.0, 0.24, 0.0],
        [0.0, 0.38, 0.0],
        [0.0, 0.47, 0.0],
        [0.0, 0.56, 0.0],
        [-0.04, 0.22, 0.0],
        [-0.04, 0.18, 0.05],
        [-0.03, 0.14, 0.08],
        [-0.02, 0.10, 0.09],
        [-0.08, 0.20, 0.0],
        [-0.07, 0.15, 0.04],
        [-0.06, 0.11, 0.07],
        [-0.05, 0.08, 0.08],
    ]


def generate_samples(base_landmarks, n_samples, noise=0.02):
    samples = []
    for _ in range(n_samples):
        sample = []
        for landmark in base_landmarks:
            noisy_x = landmark[0] + np.random.normal(0, noise)
            noisy_y = landmark[1] + np.random.normal(0, noise)
            noisy_z = landmark[2] + np.random.normal(0, noise * 0.5)
            sample.extend([noisy_x, noisy_y, noisy_z])
        samples.append(sample)
    return np.array(samples)


def _dense_layer_config(name, units, activation, batch_input_shape=None):
    config = {
        'name': name,
        'trainable': True,
        'units': units,
        'activation': activation,
        'use_bias': True,
    }
    if batch_input_shape is not None:
        config['batch_input_shape'] = batch_input_shape
    return {
        'class_name': 'Dense',
        'config': config,
    }


def train_model():
    np.random.seed(RANDOM_STATE)

    print('=' * 50)
    print('Sign Language Meeting - Model Training')
    print('=' * 50)

    print('Generating training data...')

    base_landmarks_by_sign = {
        'HELLO': get_hello_landmarks(),
        'THANKS': get_thanks_landmarks(),
        'BYE': get_bye_landmarks(),
        'YES': get_yes_landmarks(),
        'NO': get_no_landmarks(),
    }

    X_parts = []
    y_parts = []

    for sign in SIGN_LABELS:
        samples = generate_samples(
            base_landmarks_by_sign[sign],
            SAMPLES_PER_SIGN,
            noise=NOISE_FACTOR,
        )
        X_parts.append(samples)
        y_parts.extend([sign] * SAMPLES_PER_SIGN)

    X = np.vstack(X_parts)
    y = np.array(y_parts)

    print(f'Total samples: {len(X)} ({SAMPLES_PER_SIGN} per sign x {len(SIGN_LABELS)} signs)')

    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(y)
    label_mapping_int = {int(i): label for i, label in enumerate(label_encoder.classes_)}

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y_encoded,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y_encoded,
    )

    print(f'Train set: {len(X_train)} samples')
    print(f'Test set: {len(X_test)} samples')

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    print('Features scaled')

    mlp = MLPClassifier(
        hidden_layer_sizes=(128, 64, 32),
        activation='relu',
        solver='adam',
        alpha=0.001,
        batch_size=32,
        learning_rate='adaptive',
        max_iter=500,
        random_state=RANDOM_STATE,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=20,
        verbose=False,
    )

    print('Training MLP model...')
    mlp.fit(X_train_scaled, y_train)
    print('Training complete')

    y_pred = mlp.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)

    print(f'\nModel Accuracy: {accuracy * 100:.2f}%\n')
    print('Classification Report:')
    print(
        classification_report(
            y_test,
            y_pred,
            target_names=label_encoder.classes_,
            digits=2,
        )
    )

    cm = confusion_matrix(y_test, y_pred)
    print('Confusion Matrix:')
    print(cm)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    input_size = X_train.shape[1]
    output_size = len(label_encoder.classes_)
    hidden_layer_sizes = list(mlp.hidden_layer_sizes)

    layers = [
        _dense_layer_config('dense_0', hidden_layer_sizes[0], 'relu', [None, input_size]),
        _dense_layer_config('dense_1', hidden_layer_sizes[1], 'relu'),
        _dense_layer_config('dense_2', hidden_layer_sizes[2], 'relu'),
        _dense_layer_config('dense_output', output_size, 'softmax'),
    ]

    weight_specs = []
    for layer_index, (weights, biases) in enumerate(zip(mlp.coefs_, mlp.intercepts_)):
        layer_name = 'dense_output' if layer_index == len(mlp.coefs_) - 1 else f'dense_{layer_index}'
        weight_specs.append(
            {
                'name': f'{layer_name}/kernel',
                'shape': list(weights.shape),
                'dtype': 'float32',
            }
        )
        weight_specs.append(
            {
                'name': f'{layer_name}/bias',
                'shape': list(biases.shape),
                'dtype': 'float32',
            }
        )

    model_json = {
        'format': 'layers-model',
        'generatedBy': 'SignMeet-trainer',
        'convertedBy': None,
        'modelTopology': {
            'class_name': 'Sequential',
            'keras_version': '2.12.0',
            'backend': 'tensorflow',
            'config': {
                'name': 'sign_language_model',
                'layers': layers,
            },
        },
        'weightsManifest': [
            {
                'paths': [WEIGHTS_FILE],
                'weights': weight_specs,
            }
        ],
    }

    model_path = os.path.join(OUTPUT_DIR, MODEL_FILE)
    weights_path = os.path.join(OUTPUT_DIR, WEIGHTS_FILE)
    label_encoder_path = os.path.join(OUTPUT_DIR, LABEL_ENCODER_FILE)
    scaler_path = os.path.join(OUTPUT_DIR, 'scaler.json')
    confusion_matrix_path = os.path.join(OUTPUT_DIR, 'confusion_matrix.png')

    with open(model_path, 'w', encoding='utf-8') as model_file:
        json.dump(model_json, model_file, indent=2)

    with open(weights_path, 'wb') as weights_file:
        for weights, biases in zip(mlp.coefs_, mlp.intercepts_):
            for array in (weights, biases):
                flat = np.asarray(array, dtype=np.float32).ravel(order='C')
                weights_file.write(struct.pack(f'<{flat.size}f', *flat))

    label_encoder_payload = {
        'classes': [str(class_name) for class_name in label_encoder.classes_],
        'mapping': {str(i): str(name) for i, name in label_mapping_int.items()},
    }
    with open(label_encoder_path, 'w', encoding='utf-8') as label_file:
        json.dump(label_encoder_payload, label_file, indent=2)

    scaler_payload = {
        'mean': scaler.mean_.astype(float).tolist(),
        'scale': scaler.scale_.astype(float).tolist(),
    }
    with open(scaler_path, 'w', encoding='utf-8') as scaler_file:
        json.dump(scaler_payload, scaler_file, indent=2)

    print('\nFiles saved:')
    print(f'  {model_path}')
    print(f'  {weights_path}')
    print(f'  {label_encoder_path}')
    print(f'  {scaler_path}')

    plt.figure(figsize=(8, 6))
    sns.heatmap(
        cm,
        annot=True,
        fmt='d',
        cmap='Blues',
        xticklabels=label_encoder.classes_,
        yticklabels=label_encoder.classes_,
    )
    plt.title('Confusion Matrix')
    plt.xlabel('Predicted Label')
    plt.ylabel('True Label')
    plt.tight_layout()
    plt.savefig(confusion_matrix_path, dpi=150)
    plt.close()
    print('Confusion matrix saved')

    print('\nModel Architecture Summary:')
    print(f'  Input features: {input_size}')
    print(f'  Hidden layers: {tuple(hidden_layer_sizes)}')
    print(f'  Output classes: {output_size}')
    print(f'  Total layers: {mlp.n_layers_}')

    print('\nExported File Sizes:')
    for file_path in [model_path, weights_path, label_encoder_path, scaler_path, confusion_matrix_path]:
        size_bytes = os.path.getsize(file_path)
        print(f'  {os.path.basename(file_path)}: {size_bytes / 1024:.2f} KB')

    print('\nModel ready for browser inference')


if __name__ == '__main__':
    train_model()
