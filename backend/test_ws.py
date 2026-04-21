import asyncio
import websockets

async def test_ws():
    uri = "ws://127.0.0.1:8000/ws/test_user"
    try:
        async with websockets.connect(uri) as websocket:
            print("Successfully connected to WebSocket!")
            await websocket.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
