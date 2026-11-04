//! HashMap із сидованим хешером.
//!
//! У `wasm32-unknown-unknown` стандартний `RandomState` не має джерела ентропії, тож ключі SipHash сталі, а ключами
//! таблиць є дані, якими керує атакуючий (IP, імена користувачів з журналу). Щоб не дати побудувати колізії наперед,
//! Node передає випадкове 64-бітне зерно на кожен виклик, і воно підмішується в хеш першим.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};

/// Будівник хешерів із зерном.
#[derive(Clone, Copy, Debug)]
pub struct Seeded(pub u64);

impl BuildHasher for Seeded {
    type Hasher = DefaultHasher;
    fn build_hasher(&self) -> DefaultHasher {
        let mut h = DefaultHasher::new();
        h.write_u64(self.0);
        h
    }
}

/// `HashMap` зі сидованим хешером.
pub type Map<K, V> = HashMap<K, V, Seeded>;

/// Створює порожню мапу із зерном.
pub fn map<K, V>(seed: u64) -> Map<K, V> {
    HashMap::with_hasher(Seeded(seed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn different_seeds_give_different_hashes() {
        let a = Seeded(1).hash_one("203.0.113.9");
        let b = Seeded(2).hash_one("203.0.113.9");
        assert_ne!(a, b);
        assert_eq!(a, Seeded(1).hash_one("203.0.113.9"));
    }

    #[test]
    fn map_works() {
        let mut m: Map<String, u32> = map(42);
        *m.entry("x".into()).or_default() += 2;
        assert_eq!(m["x"], 2);
    }
}
