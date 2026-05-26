#!/bin/sh

# Inject environment variables
echo "window.ENV = {" > /usr/share/nginx/html/env-config.js
echo "  REACT_APP_MAPBOX_TOKEN: '$REACT_APP_MAPBOX_TOKEN'" >> /usr/share/nginx/html/env-config.js
echo "};" >> /usr/share/nginx/html/env-config.js

exec "$@" 