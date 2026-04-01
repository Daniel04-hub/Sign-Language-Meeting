import cv2
import numpy as np
import os
import mediapipe as mp
import json
import time

DATA_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    'my_data'
)

SIGNS_TO_COLLECT = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'H', 'I', 'K', 'L', 'M', 'N', 'O',
    'P', 'Q', 'R', 'S', 'T', 'U', 'V',
    'W', 'X', 'Y', 'NOTHING'
]

SAMPLES_PER_SIGN = 100

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7
)

def extract_landmarks(frame):
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands.process(rgb)
    if not results.multi_hand_landmarks:
        return None, None
    landmarks = results.multi_hand_landmarks[0]
    lm = landmarks.landmark
    wrist_x = lm[0].x
    wrist_y = lm[0].y
    wrist_z = lm[0].z
    features = []
    for point in lm:
        features.extend([
            point.x - wrist_x,
            point.y - wrist_y,
            point.z - wrist_z
        ])
    return np.array(features, dtype=np.float32), landmarks

def draw_instructions(frame, sign, collected, total, state, countdown=0):
    h, w = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 100), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    cv2.putText(frame,
        'Sign: ' + sign + '  (' + str(collected) + '/' + str(total) + ')',
        (10, 35),
        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2
    )

    if state == 'waiting':
        cv2.putText(frame,
            'Press SPACE to start collecting',
            (10, 75),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2
        )
    elif state == 'countdown':
        cv2.putText(frame,
            'Starting in ' + str(countdown) + '...',
            (10, 75),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2
        )
    elif state == 'collecting':
        cv2.putText(frame,
            'COLLECTING - Hold the sign steady!',
            (10, 75),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
        )
    elif state == 'done':
        cv2.putText(frame,
            'Done! Press SPACE for next sign',
            (10, 75),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
        )

    bar_width = int((collected / total) * w)
    cv2.rectangle(frame, (0, h-10), (bar_width, h), (0, 255, 0), -1)

    return frame

def collect_sign(sign_name, cap):
    save_dir = os.path.join(DATA_DIR, sign_name)
    os.makedirs(save_dir, exist_ok=True)

    existing = len([f for f in os.listdir(save_dir)
                    if f.endswith('.npy')])
    if existing >= SAMPLES_PER_SIGN:
        print(sign_name + ': Already have ' + str(existing) + ' samples, skipping')
        return existing

    collected = existing
    state = 'waiting'
    countdown_start = 0

    print()
    print('=' * 40)
    print('Sign: ' + sign_name)
    print('Need: ' + str(SAMPLES_PER_SIGN - existing) + ' more samples')
    print('Instructions:')
    print('  Make the ' + sign_name + ' sign with your hand')
    print('  Press SPACE when ready')
    print('  Hold sign steady while collecting')
    print('=' * 40)

    while collected < SAMPLES_PER_SIGN:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        landmarks, hand_landmarks = extract_landmarks(frame)

        if hand_landmarks:
            mp_draw.draw_landmarks(
                frame, hand_landmarks,
                mp_hands.HAND_CONNECTIONS
            )

        if state == 'countdown':
            elapsed = time.time() - countdown_start
            remaining = 3 - int(elapsed)
            if remaining <= 0:
                state = 'collecting'
            else:
                frame = draw_instructions(
                    frame, sign_name, collected,
                    SAMPLES_PER_SIGN, state, remaining
                )
        elif state == 'collecting':
            if landmarks is not None:
                save_path = os.path.join(
                    save_dir,
                    str(collected) + '.npy'
                )
                np.save(save_path, landmarks)
                collected += 1

                if collected >= SAMPLES_PER_SIGN:
                    state = 'done'
        else:
            frame = draw_instructions(
                frame, sign_name, collected,
                SAMPLES_PER_SIGN, state
            )

        if state == 'collecting':
            frame = draw_instructions(
                frame, sign_name, collected,
                SAMPLES_PER_SIGN, state
            )
        elif state == 'done':
            frame = draw_instructions(
                frame, sign_name, collected,
                SAMPLES_PER_SIGN, state
            )

        cv2.imshow('ASL Data Collector - ' + sign_name, frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord(' '):
            if state == 'waiting':
                state = 'countdown'
                countdown_start = time.time()
            elif state == 'done':
                break
        elif key == ord('q'):
            print('Quitting...')
            return collected
        elif key == 27:
            print('Skipping ' + sign_name)
            return collected

    return collected

def main():
    print('=' * 50)
    print('ASL Data Collector')
    print('Collecting YOUR hand landmarks')
    print('=' * 50)
    print()
    print('Signs to collect: ' + str(SIGNS_TO_COLLECT))
    print('Samples per sign: ' + str(SAMPLES_PER_SIGN))
    print()
    print('CONTROLS:')
    print('  SPACE = Start collecting / Next sign')
    print('  ESC   = Skip current sign')
    print('  Q     = Quit and save progress')
    print()
    print('TIPS FOR GOOD DATA:')
    print('  Hold sign steady in frame')
    print('  Good lighting on your hand')
    print('  Keep hand centered in camera')
    print('  Vary position slightly between frames')
    print()

    os.makedirs(DATA_DIR, exist_ok=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print('ERROR: Cannot open camera')
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    total_collected = 0
    for sign in SIGNS_TO_COLLECT:
        count = collect_sign(sign, cap)
        total_collected += count
        print(sign + ': ' + str(count) + ' samples collected')

    cap.release()
    cv2.destroyAllWindows()

    print()
    print('=' * 50)
    print('Data collection complete!')
    print('Total samples: ' + str(total_collected))
    print('Data saved to: ' + DATA_DIR)
    print('Now run: python train_mine.py')
    print('=' * 50)

if __name__ == '__main__':
    main()
