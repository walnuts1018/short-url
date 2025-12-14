use std::sync::OnceLock;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqids::Sqids;

const SIMILAR_CHARS: &[(&str, char)] = &[
    ("C", 'c'),
    ("Ilj17", 'i'),
    ("O0", 'o'),
    ("P", 'p'),
    ("S5", 's'),
    ("UVvr", 'u'),
    ("W", 'w'),
    ("X", 'x'),
    ("Z2", 'z'),
    ("q", '9'),
];

const NORM_TABLE: [u8; 256] = {
    let mut table = [0; 256];

    let mut i = 0;
    while i < 256 {
        table[i] = i as u8;
        i += 1;
    }

    let mut r = 0;
    while r < SIMILAR_CHARS.len() {
        let (sources, target) = SIMILAR_CHARS[r];
        let src_bytes = sources.as_bytes();

        let mut k = 0;
        while k < src_bytes.len() {
            table[src_bytes[k] as usize] = target as u8;
            k += 1;
        }
        r += 1;
    }
    table
};

fn normalize(input: &str) -> String {
    let normalized_bytes = input.bytes().map(|b| NORM_TABLE[b as usize]).collect();

    unsafe { String::from_utf8_unchecked(normalized_bytes) }
}

fn alphabets() -> Vec<char> {
    let mut chars = Vec::new();
    for b in b'A'..=b'Z' {
        let c = b as char;
        if !SIMILAR_CHARS.iter().any(|(s, _)| s.contains(c)) {
            chars.push(c);
        }
    }
    for b in b'a'..=b'z' {
        let c = b as char;
        if !SIMILAR_CHARS.iter().any(|(s, _)| s.contains(c)) {
            chars.push(c);
        }
    }
    for b in b'0'..=b'9' {
        let c = b as char;
        if !SIMILAR_CHARS.iter().any(|(s, _)| s.contains(c)) {
            chars.push(c);
        }
    }
    chars
}

static SQIDS: OnceLock<Sqids> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
pub struct ID(pub String);

impl ID {
    pub fn new(s: String) -> Self {
        return Self(normalize(&s));
    }

    pub fn generate(seq: i64) -> Result<Self> {
        let sqids = SQIDS.get_or_init(|| {
            Sqids::builder()
                .min_length(5)
                .alphabet(alphabets())
                .build()
                .expect("Failed to build SQIDS")
        });

        let id_str = sqids.encode(&[seq as u64])?;
        return Ok(Self(id_str));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_generate() {
        let id1 = ID::generate(123).unwrap();
        let id2 = ID::generate(123).unwrap();
        let id3 = ID::generate(1234567).unwrap();

        assert_eq!(id1, id2);
        assert_ne!(id1, id3);
    }
}
