import threading
import os
import logging
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from config import logger

class ImageProxyServer:
    """
    Simple HTTP server to serve local AC content images to the frontend.
    Runs on port 8081 by default.
    """
    def __init__(self, port=8081):
        self.port = port
        self.server = None
        self._thread = None
        self.ac_path = None  # Will be set when station registers
    
    def start(self, ac_path: str):
        """Start the image proxy server"""
        self.ac_path = ac_path
        if not ac_path:
            logger.warning("ImageProxy: No ac_path provided, not starting")
            return
        if self._thread and self._thread.is_alive():
            logger.info("ImageProxy already running")
            return
        
        self._thread = threading.Thread(target=self._run_server, daemon=True)
        self._thread.start()
        logger.info(f"Image proxy server started on port {self.port}")
    
    def _run_server(self):
        """Run the HTTP server"""
        
        current_ac_path = self.ac_path
        
        class ImageHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                # Don't call super().__init__ here, we override directory
                self.ac_content_path = os.path.join(current_ac_path, "content") if current_ac_path else ""
                super().__init__(*args, directory=self.ac_content_path, **kwargs)
            
            def do_GET(self):
                # Parse the path and serve images from AC content folder
                # URL: /cars/ferrari_458/ui/badge.png -> content/cars/ferrari_458/ui/badge.png
                try:
                    # Clean path
                    path = urllib.parse.unquote(self.path)
                    if path.startswith('/'):
                        path = path[1:]
                    
                    full_path = os.path.join(self.ac_content_path, path)
                    
                    # Security: ensure we stay within content folder
                    if not os.path.realpath(full_path).startswith(os.path.realpath(self.ac_content_path)):
                        self.send_error(403, "Forbidden")
                        return
                    
                    if os.path.exists(full_path) and os.path.isfile(full_path):
                        # Determine content type
                        ext = os.path.splitext(full_path)[1].lower()
                        content_type = {
                            '.png': 'image/png',
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.gif': 'image/gif',
                            '.webp': 'image/webp',
                        }.get(ext, 'application/octet-stream')
                        
                        # Serve the file
                        self.send_response(200)
                        self.send_header('Content-Type', content_type)
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.send_header('Cache-Control', 'max-age=86400')  # Cache for 1 day
                        self.end_headers()
                        
                        with open(full_path, 'rb') as f:
                            self.wfile.write(f.read())
                    else:
                        self.send_error(404, "File not found")
                except Exception as e:
                    logger.error(f"ImageProxy error: {e}")
                    self.send_error(500, str(e))
            
            def log_message(self, format, *args):
                # Suppress default logging
                pass
        
        try:
            # use ThreadingHTTPServer for parallel processing
            self.server = ThreadingHTTPServer(('0.0.0.0', self.port), ImageHandler)
            self.server.serve_forever()
        except Exception as e:
            logger.error(f"ImageProxy server error: {e}")

# Global image proxy instance
image_proxy = ImageProxyServer()
