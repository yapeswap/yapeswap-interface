import { Interface } from '@ethersproject/abi'
import { abi as STAKING_REWARDS_ABI } from '@uniswap/liquidity-staker/build/StakingRewards.json'
import { abi as STAKING_REWARDS_FACTORY_ABI } from '@uniswap/liquidity-staker/build/StakingRewardsFactory.json'
import { abi as MINING_POOL_ABI } from './whf/MiningPool.json'
import * as ERC20_STAKING_MINING_POOL_V1_ABI from './whf/ERC20StakeMiningV1.json'

const STAKING_REWARDS_INTERFACE = new Interface(STAKING_REWARDS_ABI)

const STAKING_REWARDS_FACTORY_INTERFACE = new Interface(STAKING_REWARDS_FACTORY_ABI)

const MINING_POOL_INTERFACE = new Interface(MINING_POOL_ABI)

export {
  STAKING_REWARDS_FACTORY_INTERFACE,
  STAKING_REWARDS_INTERFACE,
  MINING_POOL_INTERFACE,
  MINING_POOL_ABI,
  ERC20_STAKING_MINING_POOL_V1_ABI
}
