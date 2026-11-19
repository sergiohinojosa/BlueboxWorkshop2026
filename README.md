# Workshop Shop

A small, editable ecommerce application for workshops. It has a browser frontend, shop API, PostgreSQL database, PostgREST data gateway, and separate mock payment service. The application source is mounted into prebuilt Node containers, so there are no application image builds.

## Run locally

To start the app:

```bash
make up
```

To stop the app:

```bash
make down
```

### OTel

If you want OTel, use:

```bash
# Paste your values — the endpoint can also be fetched by the CLI
export OTEL_EXPORTER_OTLP_ENDPOINT="https://<your-endpoint-from-bluebox-setup>"

# Paste the full header value from Bluebox Setup (do not include angle brackets)
export OTEL_EXPORTER_OTLP_HEADERS="<header value from Bluebox Setup>"

# Start the app (pulls images, waits for readiness)
make up
```

The shop API limits concurrent PostgREST requests to 4 by default, queues up to 100 callers for at most 1 second, and returns `503` with `Retry-After` when saturated. Configure `DATABASE_POOL_SIZE`, `DATABASE_POOL_MAX_QUEUE`, and `DATABASE_POOL_WAIT_TIMEOUT_MS` in the environment to tune these limits. Pool saturation is recorded as a `database_pool_exhausted` application log and as an exception on the active span. The existing OTel setup exports console logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

Increase the pool gradually and load-test while monitoring PostgREST and PostgreSQL capacity; their connection limits and saturation are not measured by this workshop app.
