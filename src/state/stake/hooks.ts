import { ChainId, CurrencyAmount, JSBI, Token, TokenAmount, WETH, Pair } from '@yapeswap/yape-sdk'
import { useMemo } from 'react'
import { DAI, USDC, USDT, WBTC, YAPE } from '../../constants'
import { MINING_POOL_INTERFACE } from '../../constants/abis/staking-rewards'
import { useActiveWeb3React } from '../../hooks'
import { NEVER_RELOAD, useMultipleContractSingleData } from '../multicall/hooks'
import { tryParseAmount } from '../swap/hooks'
import useCurrentBlockTimestamp from 'hooks/useCurrentBlockTimestamp'

export const STAKING_GENESIS = 1600387200

export const REWARDS_DURATION_DAYS = 60

// TODO add staking rewards addresses here
export const STAKING_REWARDS_INFO: {
  [chainId in ChainId]?: {
    tokens: [Token, Token]
    stakingRewardAddress: string
  }[]
} = {
  [ChainId.MAINNET]: [
    {
      tokens: [WETH[ChainId.MAINNET], YAPE],
      stakingRewardAddress: '0xfAAE9a903469883d7a2DbAcE1A53ECD7E7949f52'
    },
    {
      tokens: [WETH[ChainId.MAINNET], DAI],
      stakingRewardAddress: '0x1faACBb5b7b35DAf5C1A95F20A5a527477DfA8c0'
    },
    {
      tokens: [WETH[ChainId.MAINNET], USDC],
      stakingRewardAddress: '0x8059234aD4d6720DA8500Cf88E2FD7A635595f45'
    },
    {
      tokens: [WETH[ChainId.MAINNET], USDT],
      stakingRewardAddress: '0x055951c3Bc52A98500A5861716C443544ECeC837'
    },
    {
      tokens: [WETH[ChainId.MAINNET], WBTC],
      stakingRewardAddress: '0x902aca16FCaB57C565eA472DF1549e0f57a17813'
    },
    {
      tokens: [USDC, WBTC],
      stakingRewardAddress: '0x13280523586511bB2cd333a82C2761D325A83E0e'
    },
    {
      tokens: [USDT, WBTC],
      stakingRewardAddress: '0xe1362A7B4749a63F011c76D7e2Cf5f030089917F'
    },
    {
      tokens: [DAI, WBTC],
      stakingRewardAddress: '0x186e16cc466A6C03217f4B8FE615997F6b6E0651'
    },
    {
      tokens: [USDC, DAI],
      stakingRewardAddress: '0xcf9539f92930B5D692eaA6Fc33ff3e55b5c49550'
    },
    {
      tokens: [USDC, USDT],
      stakingRewardAddress: '0x625A2e9877F53f3b296323DC651cf8Ec235Faa3c'
    }
  ]
}

export const cYAPE_BURN_MINING = "0x8E9C4Dfc2Fceea58B97b0946eF5998a2786914B9"

export interface StakingInfo {
  // the address of the reward contract
  stakingRewardAddress: string
  // the tokens involved in this pair
  tokens: [Token, Token]
  // the amount of token currently staked, or undefined if no account
  stakedAmount: TokenAmount
  // the amount of reward token earned by the active account, or undefined if no account
  earnedAmount: TokenAmount
  // the total amount of token staked in the contract
  totalStakedAmount: TokenAmount
  // the amount of token distributed per second to all LPs, constant
  totalRewardRate: TokenAmount
  // the current amount of token distributed to the active account per second.
  // equivalent to percent of total supply * reward rate
  rewardRate: TokenAmount
  // if pool is active
  active: boolean
  // calculates a hypothetical amount of token distributed to the active account per second.
  getHypotheticalRewardRate: (
    stakedAmount: TokenAmount,
    totalStakedAmount: TokenAmount,
    totalRewardRate: TokenAmount
  ) => TokenAmount
}

// gets the staking info from the network for the active chain id
export function useStakingInfo(pairToFilterBy?: Pair | null): StakingInfo[] {
  const { chainId, account } = useActiveWeb3React()

  // detect if staking is ended
  const currentBlockTimestamp = useCurrentBlockTimestamp()

  const info = useMemo(
    () =>
      chainId
        ? STAKING_REWARDS_INFO[chainId]?.filter(stakingRewardInfo =>
            pairToFilterBy === undefined
              ? true
              : pairToFilterBy === null
              ? false
              : pairToFilterBy.involvesToken(stakingRewardInfo.tokens[0]) &&
                pairToFilterBy.involvesToken(stakingRewardInfo.tokens[1])
          ) ?? []
        : [],
    [chainId, pairToFilterBy]
  )

  const yape = chainId === ChainId.MAINNET ? YAPE : undefined

  const rewardsAddresses = useMemo(() => info.map(({ stakingRewardAddress }) => stakingRewardAddress), [info])

  const accountArg = useMemo(() => [account ?? undefined], [account])

  // get all the info from the staking rewards contracts
  const balances = useMultipleContractSingleData(rewardsAddresses, MINING_POOL_INTERFACE, 'dispatchedMiners', accountArg)
  const earnedAmounts = useMultipleContractSingleData(rewardsAddresses, MINING_POOL_INTERFACE, 'mined', accountArg)
  const totalSupplies = useMultipleContractSingleData(rewardsAddresses, MINING_POOL_INTERFACE, 'totalMiners')

  // tokens per second, constants
  const rewardRates = useMultipleContractSingleData(
    rewardsAddresses,
    MINING_POOL_INTERFACE,
    'miningRate',
    undefined,
    NEVER_RELOAD
  )
  return useMemo(() => {
    if (!chainId || !yape) return []

    return rewardsAddresses.reduce<StakingInfo[]>((memo, rewardsAddress, index) => {
      // these two are dependent on account
      const balanceState = balances[index]
      const earnedAmountState = earnedAmounts[index]

      // these get fetched regardless of account
      const totalSupplyState = totalSupplies[index]
      const rewardRateState = rewardRates[index]

      if (
        // these may be undefined if not logged in
        !balanceState?.loading &&
        !earnedAmountState?.loading &&
        // always need these
        totalSupplyState &&
        !totalSupplyState.loading &&
        rewardRateState &&
        !rewardRateState.loading
      ) {
        if (balanceState?.error || earnedAmountState?.error || totalSupplyState.error || rewardRateState.error) {
          console.error('Failed to load staking rewards info')
          return memo
        }

        // get the LP token
        const tokens = info[index].tokens
        const dummyPair = new Pair(new TokenAmount(tokens[0], '0'), new TokenAmount(tokens[1], '0'))

        // check for account, if no account set to 0

        const stakedAmount = new TokenAmount(dummyPair.liquidityToken, JSBI.BigInt(balanceState?.result?.[0] ?? 0))
        const totalStakedAmount = new TokenAmount(dummyPair.liquidityToken, JSBI.BigInt(totalSupplyState.result?.[0]))
        const totalRewardRate = new TokenAmount(yape, JSBI.BigInt(rewardRateState.result?.[0]))

        const getHypotheticalRewardRate = (
          stakedAmount: TokenAmount,
          totalStakedAmount: TokenAmount,
          totalRewardRate: TokenAmount
        ): TokenAmount => {
          return new TokenAmount(
            yape,
            JSBI.greaterThan(totalStakedAmount.raw, JSBI.BigInt(0))
              ? JSBI.divide(JSBI.multiply(totalRewardRate.raw, stakedAmount.raw), totalStakedAmount.raw)
              : JSBI.BigInt(0)
          )
        }

        const individualRewardRate = getHypotheticalRewardRate(stakedAmount, totalStakedAmount, totalRewardRate)

        // compare period end timestamp vs current block timestamp (in seconds)
        // const active = !totalRewardRate.equalTo('0')
        const active = true // todo use dynamic setting later

        memo.push({
          stakingRewardAddress: rewardsAddress,
          tokens: info[index].tokens,
          earnedAmount: new TokenAmount(yape, JSBI.BigInt(earnedAmountState?.result?.[0] ?? 0)),
          rewardRate: individualRewardRate,
          totalRewardRate: totalRewardRate,
          stakedAmount: stakedAmount,
          totalStakedAmount: totalStakedAmount,
          getHypotheticalRewardRate,
          active
        })
      }
      return memo
    }, [])
  }, [
    balances,
    chainId,
    currentBlockTimestamp,
    earnedAmounts,
    info,
    rewardRates,
    rewardsAddresses,
    totalSupplies,
    yape
  ])
}

export function useTotalUniEarned(): TokenAmount | undefined {
  const { chainId } = useActiveWeb3React()
  const yape = chainId === ChainId.MAINNET ? YAPE : undefined
  const stakingInfos = useStakingInfo()

  return useMemo(() => {
    if (!yape) return undefined
    return (
      stakingInfos?.reduce(
        (accumulator, stakingInfo) => accumulator.add(stakingInfo.earnedAmount),
        new TokenAmount(yape, '0')
      ) ?? new TokenAmount(yape, '0')
    )
  }, [stakingInfos, yape])
}

// based on typed value
export function useDerivedStakeInfo(
  typedValue: string,
  stakingToken: Token,
  userLiquidityUnstaked: TokenAmount | undefined
): {
  parsedAmount?: CurrencyAmount
  error?: string
} {
  const { account } = useActiveWeb3React()

  const parsedInput: CurrencyAmount | undefined = tryParseAmount(typedValue, stakingToken)

  const parsedAmount =
    parsedInput && userLiquidityUnstaked && JSBI.lessThanOrEqual(parsedInput.raw, userLiquidityUnstaked.raw)
      ? parsedInput
      : undefined

  let error: string | undefined
  if (!account) {
    error = 'Connect Wallet'
  }
  if (!parsedAmount) {
    error = error ?? 'Enter an amount'
  }

  return {
    parsedAmount,
    error
  }
}

// based on typed value
export function useDerivedUnstakeInfo(
  typedValue: string,
  stakingAmount: TokenAmount
): {
  parsedAmount?: CurrencyAmount
  error?: string
} {
  const { account } = useActiveWeb3React()

  const parsedInput: CurrencyAmount | undefined = tryParseAmount(typedValue, stakingAmount.token)

  const parsedAmount = parsedInput && JSBI.lessThanOrEqual(parsedInput.raw, stakingAmount.raw) ? parsedInput : undefined

  let error: string | undefined
  if (!account) {
    error = 'Connect Wallet'
  }
  if (!parsedAmount) {
    error = error ?? 'Enter an amount'
  }

  return {
    parsedAmount,
    error
  }
}
