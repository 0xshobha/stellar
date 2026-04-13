#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

#[derive(Clone)]
#[contracttype]
pub struct Agent {
    pub name: Symbol,
    pub owner: Address,
    pub endpoint: String,
    pub price_usdc: i128,
    pub reputation: i128,
    pub jobs_completed: u64,
    pub jobs_failed: u64,
    pub recursive: bool,
    /// Logical capability bucket: price, news, summarize, sentiment, math, research
    pub capability: String,
}

#[contracttype]
pub enum DataKey {
    Agent(Symbol),
    AgentList,
}

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    pub fn register_agent(
        env: Env,
        name: Symbol,
        owner: Address,
        endpoint: String,
        price_usdc: i128,
        recursive: bool,
        capability: String,
    ) {
        owner.require_auth();

        let key = DataKey::Agent(name.clone());
        let exists: bool = env.storage().persistent().has(&key);
        if exists {
            panic!("agent already exists");
        }

        let agent = Agent {
            name: name.clone(),
            owner,
            endpoint,
            price_usdc,
            reputation: 5000,
            jobs_completed: 0,
            jobs_failed: 0,
            recursive,
            capability,
        };

        env.storage().persistent().set(&key, &agent);

        let mut list: Vec<Symbol> = get_agent_symbol_list(&env);
        list.push_back(name);
        env.storage().persistent().set(&DataKey::AgentList, &list);
    }

    pub fn get_agent(env: Env, name: Symbol) -> Option<Agent> {
        env.storage().persistent().get(&DataKey::Agent(name))
    }

    pub fn list_agents(env: Env) -> Vec<Agent> {
        let list: Vec<Symbol> = get_agent_symbol_list(&env);

        let mut out = Vec::new(&env);
        for name in list.iter() {
            let key = DataKey::Agent(name.clone());
            let maybe: Option<Agent> = env.storage().persistent().get(&key);
            if let Some(agent) = maybe {
                out.push_back(agent);
            }
        }
        out
    }

    /// All agents advertising a capability (e.g. "price", "news").
    pub fn get_agents_by_capability(env: Env, capability: String) -> Vec<Agent> {
        let list: Vec<Symbol> = get_agent_symbol_list(&env);
        let mut out = Vec::new(&env);
        for name in list.iter() {
            let key = DataKey::Agent(name.clone());
            let maybe: Option<Agent> = env.storage().persistent().get(&key);
            if let Some(agent) = maybe {
                if agent.capability == capability {
                    out.push_back(agent);
                }
            }
        }
        out
    }

    /// Highest (reputation * 1000 - price_usdc) in the capability bucket.
    pub fn get_best_agent(env: Env, capability: String) -> Option<Agent> {
        let agents = Self::get_agents_by_capability(env, capability);
        if agents.is_empty() {
            return None;
        }
        let mut best_idx: u32 = 0;
        let mut best_score: i128 = i128::MIN;
        for i in 0..agents.len() {
            let a = agents.get(i).unwrap();
            let score = a.reputation.saturating_mul(1000).saturating_sub(a.price_usdc);
            if i == 0 || score > best_score {
                best_score = score;
                best_idx = i;
            }
        }
        Some(agents.get(best_idx).unwrap())
    }

    pub fn record_job_result(env: Env, name: Symbol, success: bool) {
        let key = DataKey::Agent(name.clone());
        let mut agent: Agent = env.storage().persistent().get(&key).unwrap();

        if success {
            agent.jobs_completed += 1;
            agent.reputation = (agent.reputation + 50).min(10000);
        } else {
            agent.jobs_failed += 1;
            agent.reputation = (agent.reputation - 100).max(0);
        }

        if agent.reputation >= 8500 {
            agent.price_usdc = ((agent.price_usdc * 110) / 100).max(1);
        } else if agent.reputation < 6000 {
            agent.price_usdc = ((agent.price_usdc * 90) / 100).max(1);
        }

        env.storage().persistent().set(&key, &agent);
    }

    pub fn update_agent_price(env: Env, name: Symbol, owner: Address, price_usdc: i128) {
        if price_usdc <= 0 {
            panic!("price must be positive");
        }

        let key = DataKey::Agent(name.clone());
        let mut agent: Agent = env.storage().persistent().get(&key).unwrap();
        owner.require_auth();

        if agent.owner != owner {
            panic!("only owner can update price");
        }

        agent.price_usdc = price_usdc;
        env.storage().persistent().set(&key, &agent);
    }
}

fn get_agent_symbol_list(env: &Env) -> Vec<Symbol> {
    env.storage()
        .persistent()
        .get(&DataKey::AgentList)
        .unwrap_or(Vec::new(env))
}
