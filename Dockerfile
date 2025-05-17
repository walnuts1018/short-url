FROM rust:1.87.0-slim-bullseye as builder

ARG BUILDDIR=/build
WORKDIR ${BUILDDIR}

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=cache,target=${BUILDDIR}/target/ \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --locked --release && \
    cp ${BUILDDIR}/target/release/short-url ${BUILDDIR}/short-url

FROM debian:12.10-slim
WORKDIR /app

RUN --mount=type=cache,target=/var/lib/apt,sharing=locked \
    --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get -y update && apt-get install -y ca-certificates

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    appuser
USER ${UID}

COPY --from=builder /build/short-url /app/short-url

EXPOSE 8080
CMD ["/app/short-url"]
