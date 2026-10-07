/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cmp::max;

use super::*;

#[derive(Clone, Default)]
pub struct Context {
    pub config_map: HashMap<String, Config>,
    pub current_namespace_name: Option<String>,
    pub current_namespace_config: Option<Config>,
    pub in_fixture_namespace: bool,
    pub fixture_callable_id_start: u64,
    current_enum: Option<general::Enum>,
    // Map type ids to pointer ids
    pointer_id_map: HashMap<u64, u64>,
    // Map type id -> callback interface ids
    callback_interface_id_map: HashMap<u64, u64>,
    builtin_types: Option<BuiltinTypes>,
}

impl Context {
    pub fn new(config_map: HashMap<String, Config>) -> Self {
        Self {
            config_map,
            ..Self::default()
        }
    }

    pub fn update_from_root(&mut self, root: &general::Root) -> Result<()> {
        self.builtin_types = Some(root.builtin_types.clone().map_node(self)?);
        self.populate_pointer_id_map(root);
        self.populate_callback_interface_id_map(root);
        root.visit(|n: &general::Namespace| {
            if !namespaces::is_fixture_namespace(&n.name) {
                n.visit(|c: &general::Callable| {
                    self.fixture_callable_id_start = max(self.fixture_callable_id_start, c.id + 1);
                });
            }
        });
        Ok(())
    }

    pub fn update_from_namespace(&mut self, namespace: &general::Namespace) {
        self.in_fixture_namespace = namespaces::is_fixture_namespace(&namespace.name);
        self.current_namespace_name = Some(namespace.name.clone());
        self.current_namespace_config = Some(
            self.config_map
                .get(&namespace.crate_name)
                .cloned()
                .unwrap_or_default(),
        );
    }

    pub fn update_from_enum(&mut self, en: &general::Enum) {
        self.current_enum = Some(en.clone());
    }

    pub fn current_enum(&self) -> Result<&general::Enum> {
        self.current_enum
            .as_ref()
            .ok_or_else(|| anyhow!("current_enum not set"))
    }

    pub fn populate_pointer_id_map(&mut self, root: &general::Root) {
        let mut counter = 0..;
        root.visit(|int: &general::Interface| {
            if !self.pointer_id_map.contains_key(&int.self_type.id) {
                self.pointer_id_map
                    .insert(int.self_type.id, counter.next().unwrap());
            }
        });
    }

    pub fn builtin_types(&self) -> Result<BuiltinTypes> {
        self.builtin_types
            .clone()
            .ok_or_else(|| anyhow!("builtin types not set"))
    }

    pub fn pointer_id(&self, type_id: u64) -> Result<u64> {
        self.pointer_id_map
            .get(&type_id)
            .cloned()
            .ok_or_else(|| anyhow!("pointer id not found (type_id: {type_id})"))
    }

    pub fn map_callable_id(&self, id: u64) -> u64 {
        if self.in_fixture_namespace {
            id + self.fixture_callable_id_start
        } else {
            id
        }
    }

    pub fn populate_callback_interface_id_map(&mut self, root: &general::Root) {
        let mut counter = 0..;
        // Generate ids for non-fixtures first, then fixtures.  This makes the switch statements a
        // bit more tidy and maybe easier to optimize.
        let namespaces = root
            .namespaces
            .values()
            .filter(|n| !namespaces::is_fixture_namespace(&n.name))
            .chain(
                root.namespaces
                    .values()
                    .filter(|n| namespaces::is_fixture_namespace(&n.name)),
            );
        for namespace in namespaces {
            namespace.visit(|cbi: &general::CallbackInterface| {
                if !self
                    .callback_interface_id_map
                    .contains_key(&cbi.self_type.id)
                {
                    self.callback_interface_id_map
                        .insert(cbi.self_type.id, counter.next().unwrap());
                }
            });
            namespace.visit(|int: &general::Interface| {
                if int.imp.has_callback_interface()
                    && !self
                        .callback_interface_id_map
                        .contains_key(&int.self_type.id)
                {
                    self.callback_interface_id_map
                        .insert(int.self_type.id, counter.next().unwrap());
                }
            });
        }
    }

    pub fn callback_interface_id(&self, type_id: u64) -> Result<u64> {
        self.callback_interface_id_map
            .get(&type_id)
            .cloned()
            .ok_or_else(|| anyhow!("callback interface id not found (type_id: {type_id})"))
    }

    pub fn current_namespace_name(&self) -> Result<&str> {
        self.current_namespace_name
            .as_deref()
            .ok_or_else(|| anyhow!("Context.current_namespace_name not set"))
    }

    pub fn current_namespace_config(&self) -> Result<&Config> {
        self.current_namespace_config
            .as_ref()
            .ok_or_else(|| anyhow!("Context.current_config not set"))
    }
}
