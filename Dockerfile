# syntax=docker/dockerfile:1

FROM lukemathwalker/cargo-chef:latest-rust-1.92.0 AS chef
WORKDIR /app

FROM chef AS planner

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=bind,source=.cargo,target=.cargo \
    cargo chef prepare --recipe-path recipe.json

FROM chef AS builder

ARG BUILDDIR=/build
WORKDIR ${BUILDDIR}

COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo chef cook --release --recipe-path recipe.json

RUN --mount=type=bind,source=src,target=src \
    --mount=type=bind,source=Cargo.toml,target=Cargo.toml \
    --mount=type=bind,source=Cargo.lock,target=Cargo.lock \
    --mount=type=bind,source=.cargo,target=.cargo \
    --mount=type=cache,target=${BUILDDIR}/target/ \
    --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    cargo build --locked --release && \
    cp ${BUILDDIR}/target/release/walnuk ${BUILDDIR}/walnuk

FROM gcr.io/distroless/cc-debian13:nonroot
WORKDIR /app

COPY --from=builder /build/walnuk /app/walnuk

EXPOSE 8080
CMD ["/app/walnuk"]
