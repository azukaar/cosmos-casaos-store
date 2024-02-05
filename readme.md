# Casaos store for cosmos

This repository is an app marketplace for Cosmos. It is directly converted from the CasaOS app store.

# How to use

Go to your CasaOS dashboard, click on the marketplace, then sources, and add the following URL to the app store URL input box:

```
https://azukaar.github.io/cosmos-casaos-store/index.json
```

# Disclaimer

Unlike the original Cosmos marketplace, this contains the CasaOS setup of the apps. This means no reverse-proxy / HTTPS are setup for them (instead the port are directly exposed). For the majority of the apps, you can close the ports yourself, and press the "new url" button on the container. Cosmos will be able to automatically suggest a working reverse proxy config for most containers out of the box.