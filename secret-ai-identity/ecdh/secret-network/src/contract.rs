use crate::error::{ContractError, CryptoError};
use crate::msg::{ExecuteMsg, InstantiateMsg, KeysResponse, QueryMsg};
use crate::state::{MyKeys, MY_KEYS};
use cosmwasm_std::{
    entry_point, to_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult,
};

use secp256k1::ecdh::SharedSecret;
use secp256k1::{PublicKey, Secp256k1, SecretKey};

use aes_siv::aead::generic_array::GenericArray;
use aes_siv::siv::Aes128Siv;
use hex;
use log::*;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, StdError> {
    deps.api
        .debug(&format!("Contract was initialized by {}", info.sender));

    Ok(Response::default())
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateKeys {} => try_create_keys(deps, env),
    }
}

pub fn try_create_keys(deps: DepsMut, env: Env) -> Result<Response, ContractError> {
    let rng = env.block.random.unwrap().0;
    let secp = Secp256k1::new();

    let private_key = SecretKey::from_slice(&rng).unwrap();
    let private_key_string = private_key.to_string();
    let private_key_bytes = hex::decode(private_key_string).unwrap();

    let public_key = PublicKey::from_secret_key(&secp, &private_key);
    let public_key_bytes = public_key.serialize().to_vec();

    let my_keys = MyKeys {
        private_key: private_key_bytes,
        public_key: public_key_bytes,
    };

    MY_KEYS.save(deps.storage, &my_keys)?;

    Ok(Response::default())
}

pub fn aes_siv_decrypt(
    ciphertext: &[u8],
    ad: Option<&[&[u8]]>,
    key: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let ad = ad.unwrap_or(&[&[]]);

    let mut cipher = Aes128Siv::new(GenericArray::clone_from_slice(key));
    cipher.decrypt(ad, ciphertext).map_err(|e| {
        warn!("aes_siv_decrypt error: {:?}", e);
        CryptoError::DecryptionError
    })
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetKeys {} => to_binary(&query_keys(deps)?),

        QueryMsg::DecryptQuery {
            public_key,
            encrypted_message,
        } => to_binary(&get_decrypted_query(deps, public_key, encrypted_message)?),
    }
}

pub fn get_decrypted_query(
    deps: Deps,
    public_key: Vec<u8>,
    encrypted_message: Vec<u8>,
) -> StdResult<String> {
    let my_keys = MY_KEYS.load(deps.storage)?;

    let my_private_key = SecretKey::from_slice(&my_keys.private_key)
        .map_err(|_| StdError::generic_err("Invalid private key"))?;

    let other_public_key = PublicKey::from_slice(&public_key)
        .map_err(|_| StdError::generic_err("Invalid public key"))?;

    let shared_secret = SharedSecret::new(&other_public_key, &my_private_key);
    let key = shared_secret.to_vec();

    let ad_data: &[&[u8]] = &[];
    let ad = Some(ad_data);

    let decrypted_data = aes_siv_decrypt(&encrypted_message, ad, &key);

    let decrypted_message = String::from_utf8(decrypted_data.unwrap()).unwrap();

    Ok(decrypted_message)
}

fn query_keys(deps: Deps) -> StdResult<KeysResponse> {
    let my_keys = MY_KEYS.load(deps.storage)?;
    Ok(KeysResponse {
        public_key: my_keys.public_key,
        private_key: my_keys.private_key,
    })
}