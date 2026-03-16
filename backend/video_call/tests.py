from django.test import TestCase, Client
from django.urls import reverse
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from video_call.routing import websocket_urlpatterns
from video_call.models import Room
import json
import uuid

from channels.db import database_sync_to_async
from django.test import override_settings
from django.test import TransactionTestCase


class RoomModelTests(TestCase):
    def test_room_creation(self):
        room = Room.objects.create(name='Test Room')
        self.assertIsNotNone(room.room_code)
        self.assertEqual(len(room.room_code), 8)
        self.assertTrue(room.is_active)
        self.assertEqual(room.max_participants, 8)
        self.assertEqual(room.current_participants, 0)

    def test_room_code_unique(self):
        rooms = [Room.objects.create(name=f'Room {index}') for index in range(10)]
        room_codes = [room.room_code for room in rooms]
        self.assertEqual(len(room_codes), len(set(room_codes)))

    def test_room_is_full(self):
        room = Room.objects.create(name='Limited Room', max_participants=2)
        room.current_participants = 2
        room.save(update_fields=['current_participants'])
        self.assertTrue(room.is_full())

    def test_room_not_full(self):
        room = Room.objects.create(name='Open Room')
        self.assertFalse(room.is_full())

    def test_room_str(self):
        room = Room.objects.create(name='Code Room')
        room.room_code = 'ABCD1234'
        room.save(update_fields=['room_code'])
        self.assertEqual(str(room), 'ABCD1234')


class RoomAPITests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_check(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get('status'), 'ok')

    def test_create_room(self):
        response = self.client.post(
            '/api/rooms/create/',
            data=json.dumps({'name': 'My Meeting'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertIn('room_code', payload)
        self.assertEqual(payload.get('name'), 'My Meeting')
        self.assertTrue(Room.objects.filter(room_code=payload['room_code']).exists())

    def test_create_room_no_name(self):
        response = self.client.post(
            '/api/rooms/create/',
            data=json.dumps({'name': ''}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_create_room_name_too_short(self):
        response = self.client.post(
            '/api/rooms/create/',
            data=json.dumps({'name': 'A'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_join_room(self):
        room = Room.objects.create(name='Joinable Room')
        response = self.client.post(
            '/api/rooms/join/',
            data=json.dumps({'room_code': room.room_code, 'user_name': 'Alice'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get('room_code'), room.room_code)
        self.assertEqual(payload.get('name'), room.name)

    def test_join_room_invalid_code(self):
        response = self.client.post(
            '/api/rooms/join/',
            data=json.dumps({'room_code': 'INVALID1', 'user_name': 'Alice'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('room_code', response.json())

    def test_join_room_full(self):
        room = Room.objects.create(name='Full Room')
        room.current_participants = room.max_participants
        room.save(update_fields=['current_participants'])

        response = self.client.post(
            '/api/rooms/join/',
            data=json.dumps({'room_code': room.room_code, 'user_name': 'Bob'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_get_room_detail(self):
        room = Room.objects.create(name='Detail Room')
        response = self.client.get(f'/api/rooms/{room.room_code}/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn('id', payload)
        self.assertIn('room_code', payload)
        self.assertIn('name', payload)
        self.assertIn('created_at', payload)
        self.assertIn('is_active', payload)
        self.assertIn('max_participants', payload)
        self.assertIn('current_participants', payload)

    def test_get_room_not_found(self):
        response = self.client.get('/api/rooms/NOTFOUND/')
        self.assertEqual(response.status_code, 404)


@override_settings(
    CHANNEL_LAYERS={
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        }
    }
)
class WebSocketConsumerTests(TransactionTestCase):
    async def _create_room(self, name='WebSocket Room', max_participants=8):
        @database_sync_to_async
        def _create():
            return Room.objects.create(name=name, max_participants=max_participants)

        return await _create()

    async def _connect(self, room_code):
        communicator = WebsocketCommunicator(
            URLRouter(websocket_urlpatterns),
            f'/ws/room/{room_code}/',
        )
        connected, _ = await communicator.connect()
        return communicator, connected

    async def _send_join(self, communicator, user_id, user_name):
        await communicator.send_to(text_data=json.dumps({
            'type': 'join',
            'user_id': user_id,
            'user_name': user_name,
        }))

    async def test_websocket_connect(self):
        room = await self._create_room()
        communicator, connected = await self._connect(room.room_code)

        self.assertTrue(connected)
        connected_message = json.loads(await communicator.receive_from())
        self.assertEqual(connected_message.get('type'), 'connected')

        await communicator.disconnect()

    async def test_join_room(self):
        room = await self._create_room()
        communicator, connected = await self._connect(room.room_code)

        self.assertTrue(connected)
        await communicator.receive_from()

        user_id = str(uuid.uuid4())
        await self._send_join(communicator, user_id, 'Alice')

        joined_message = json.loads(await communicator.receive_from())
        self.assertEqual(joined_message.get('type'), 'user-joined')
        self.assertEqual(joined_message.get('existing_users'), [])

        await communicator.disconnect()

    async def test_two_users_join(self):
        room = await self._create_room()

        communicator_1, connected_1 = await self._connect(room.room_code)
        self.assertTrue(connected_1)
        await communicator_1.receive_from()

        user_1_id = str(uuid.uuid4())
        await self._send_join(communicator_1, user_1_id, 'Alice')
        await communicator_1.receive_from()

        communicator_2, connected_2 = await self._connect(room.room_code)
        self.assertTrue(connected_2)
        await communicator_2.receive_from()

        user_2_id = str(uuid.uuid4())
        await self._send_join(communicator_2, user_2_id, 'Bob')

        user_2_joined = json.loads(await communicator_2.receive_from())
        self.assertEqual(user_2_joined.get('type'), 'user-joined')
        self.assertTrue(any(user['user_id'] == user_1_id for user in user_2_joined.get('existing_users', [])))

        user_1_new_user = json.loads(await communicator_1.receive_from())
        self.assertEqual(user_1_new_user.get('type'), 'new-user')
        self.assertEqual(user_1_new_user.get('user_id'), user_2_id)

        await communicator_1.disconnect()
        await communicator_2.disconnect()

    async def test_sign_detected_broadcast(self):
        room = await self._create_room()

        communicator_1, _ = await self._connect(room.room_code)
        await communicator_1.receive_from()
        user_1_id = str(uuid.uuid4())
        await self._send_join(communicator_1, user_1_id, 'Alice')
        await communicator_1.receive_from()

        communicator_2, _ = await self._connect(room.room_code)
        await communicator_2.receive_from()
        user_2_id = str(uuid.uuid4())
        await self._send_join(communicator_2, user_2_id, 'Bob')
        await communicator_2.receive_from()
        await communicator_1.receive_from()

        await communicator_1.send_to(text_data=json.dumps({
            'type': 'sign-detected',
            'sign': 'HELLO',
            'confidence': 0.98,
        }))

        payload_1 = json.loads(await communicator_1.receive_from())
        payload_2 = json.loads(await communicator_2.receive_from())

        self.assertEqual(payload_1.get('type'), 'sign-detected')
        self.assertEqual(payload_2.get('type'), 'sign-detected')
        self.assertEqual(payload_1.get('sign'), 'HELLO')
        self.assertEqual(payload_2.get('sign'), 'HELLO')

        await communicator_1.disconnect()
        await communicator_2.disconnect()

    async def test_invalid_sign_rejected(self):
        room = await self._create_room()
        communicator, connected = await self._connect(room.room_code)

        self.assertTrue(connected)
        await communicator.receive_from()

        await self._send_join(communicator, str(uuid.uuid4()), 'Alice')
        await communicator.receive_from()

        await communicator.send_to(text_data=json.dumps({
            'type': 'sign-detected',
            'sign': 'FAKE',
            'confidence': 0.95,
        }))

        error_message = json.loads(await communicator.receive_from())
        self.assertEqual(error_message.get('type'), 'error')

        await communicator.disconnect()

    async def test_speech_text_broadcast(self):
        room = await self._create_room()

        communicator_1, _ = await self._connect(room.room_code)
        await communicator_1.receive_from()
        await self._send_join(communicator_1, str(uuid.uuid4()), 'Alice')
        await communicator_1.receive_from()

        communicator_2, _ = await self._connect(room.room_code)
        await communicator_2.receive_from()
        await self._send_join(communicator_2, str(uuid.uuid4()), 'Bob')
        await communicator_2.receive_from()
        await communicator_1.receive_from()

        await communicator_1.send_to(text_data=json.dumps({
            'type': 'speech-text',
            'text': 'Hello everyone',
            'is_final': True,
        }))

        payload_2 = json.loads(await communicator_2.receive_from())
        self.assertEqual(payload_2.get('type'), 'speech-text')
        self.assertEqual(payload_2.get('text'), 'Hello everyone')

        own_message = await communicator_1.receive_nothing(timeout=0.3)
        self.assertTrue(own_message)

        await communicator_1.disconnect()
        await communicator_2.disconnect()

    async def test_room_full_rejection(self):
        room = await self._create_room(name='Small Room', max_participants=1)

        communicator_1, connected_1 = await self._connect(room.room_code)
        self.assertTrue(connected_1)
        await communicator_1.receive_from()
        await self._send_join(communicator_1, str(uuid.uuid4()), 'Alice')
        await communicator_1.receive_from()

        communicator_2, connected_2 = await self._connect(room.room_code)
        self.assertTrue(connected_2)
        room_full_message = json.loads(await communicator_2.receive_from())
        self.assertEqual(room_full_message.get('type'), 'room-full')

        await communicator_1.disconnect()
        await communicator_2.disconnect()
