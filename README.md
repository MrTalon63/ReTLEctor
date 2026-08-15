# ReTLEctor

### What is ReTLEctor?

Very simple web app to cache and return orbital data from Celestrak, so you can avoid getting blocked by their servers when you need to get orbital data for a large number of satellites (Or you test shit).

### Features

- Customizable ratelimiting and caching duration with environment variables
- Dockerized for easy deployment
- Light on resources

### Hosted version

ReTLEctor is hosted by me at [retlector.eu](https://retlector.eu) free of charge. While I can't guarantee uptime I will try my best to keep it running as long as I can.

### Selfhosting

As the application is Dockerized, you can easily run it on your own server or local machine using Docker.
Example docker compose file is available [here](https://github.com/MrTalon63/retlector/blob/master/docker-compose.yml).
