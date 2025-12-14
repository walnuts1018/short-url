FROM rust:1.85.1-slim-bullseye as builder

ARG BUILDDIR=/build
WORKDIR ${BUILDDIR}

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=cache,target=${BUILDDIR}/target/ \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --locked --release && \
    cp ${BUILDDIR}/target/release/walnuk ${BUILDDIR}/walnuk

FROM gcr.io/distroless/cc-debian13:nonroot
WORKDIR /app
COPY --from=builder /build/walnuk /app/walnuk

EXPOSE 8080
CMD ["/app/walnuk"]
