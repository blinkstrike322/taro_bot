import asyncio
from pathlib import Path
from aiohttp import web

HERE = Path(__file__).parent

from app import handle_readings, handle_card_pick, handle_spread


def create_webapp() -> web.Application:
    app = web.Application()
    app.router.add_get('/api/readings', handle_readings)
    app.router.add_post('/api/card_pick', handle_card_pick)
    app.router.add_post('/api/spread', handle_spread)

    next_export = HERE / "static" / "webapp"
    if next_export.is_dir():
        index_html = next_export / "index.html"
        if index_html.exists():
            async def next_index(request):
                return web.FileResponse(index_html)
            app.router.add_get("/", next_index)
        app.router.add_static("/", next_export, append_version=True)

    pixel_dir = HERE / "static" / "pixel"
    if pixel_dir.is_dir():
        app.router.add_static("/pixel", pixel_dir)

    return app


async def main():
    app = create_webapp()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    print("Web server running on http://0.0.0.0:8080")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
