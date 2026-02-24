# ReTLEctor

### What is ReTLEctor?

Very simple web app to cache and return TLEs from Celestrak, so you can avoid getting blocked by their servers when you need to get TLEs for a large number of satellites (Or you test shit).

### Features

- Customizable ratelimiting and caching duration with environment variables
- Dockerized for easy deployment
- Light on resources

### Selfhosting

As the application is Dockerized, you can easily run it on your own server or local machine using Docker.
Below is an example of how to run the application using Docker Compose (Presented values are default, unless noted otherwise!):

```yaml
services:
    retlector:
        image: ghcr.io/mrtalon63/retlector
		ports:
			- 3000:3000
        environment:
            - ALLOWED_GROUPS=visual,active,analyst,cosmos-1408,fengyun-1c-debris,iridium-33-debris,cosmos-2251-debris,weather,noaa,goes,resources,sarsat,dmc,tdrss,argos,station,geo,gnss,gps-ops,glo-ops,galileo,beidou,sbas,education # Those are groups of TLEs you can get from Celestrak at https://celestrak.org/NORAD/elements/ YOU NEED TO SET THOSE OTHERWISE NONE OF THE GROUPS WILL BE ALLOWED!
            - CACHE_DURATION_MS=86400000 # Specifies for how long to cache the TLEs in milliseconds.
			- RATE_LIMIT_MAX=60 # Maximum number of requests allowed within the rate limit window.
			- RATE_LIMIT_WINDOW_MS=60000 # Duration of the rate limit window in milliseconds.
			- KV_FILE=./data/kv.json # Path to the key-value store file.
			- LOG_LEVEL=info # Log level (e.g., debug, info, warn, error).
			- PORT=3000 # Port to run the server on.
        volumes:
            - data/:/app/data # This is where the cached TLEs will be stored, you can change it to any directory you want.
```
