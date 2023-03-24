import React, { useCallback, useState } from 'react'
import styled from 'styled-components'
import { TransactionResponse } from '@ethersproject/providers'
import { JSBI } from '@uniswap/sdk'

import { useActiveWeb3React } from '../../hooks'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import useTransactionDeadline from '../../hooks/useTransactionDeadline'
import { useCurrencyBalance } from '../../state/wallet/hooks'
import { VaiStakingInfo } from '../../state/vai-stake/hooks'
import { useDerivedStakeInfo } from '../../state/stake/hooks'
import { useVaiStakingContract } from '../../hooks/useContract'
import { useTransactionAdder } from '../../state/transactions/hooks'

import { AutoColumn } from '../Column'
import Modal from '../Modal'
import { RowBetween } from '../Row'
import CurrencyInputPanel from '../CurrencyInputPanel'
import { ButtonConfirmed, ButtonError } from '../Button'
import { LoadingView, SubmittedView } from '../ModalViews'
import { CloseIcon, TYPE } from '../../theme'
import ProgressCircles from '../ProgressSteps'

interface VaiStackingModalProps {
  isOpen: boolean
  onDismiss: () => void
  vaiStakingInfo: VaiStakingInfo
}

export default function VaiStackingModal({ isOpen, onDismiss, vaiStakingInfo }: VaiStackingModalProps) {
  const { library, account } = useActiveWeb3React()

  const [attempting, setAttempting] = useState<boolean>(false)
  const [hash, setHash] = useState<string | undefined>()

  const stakingPoolLimit = vaiStakingInfo.currentStakingLimit.subtract(vaiStakingInfo.stakedAmount)
  const singleStakingLimit = vaiStakingInfo.maxStakeAmount.subtract(vaiStakingInfo.stakedAmount)
  const maxAmountInput = stakingPoolLimit.greaterThan(singleStakingLimit) ? singleStakingLimit : stakingPoolLimit

  const [typedValue, setTypedValue] = useState('')
  const { parsedAmount, error } = useDerivedStakeInfo(typedValue, vaiStakingInfo.stakedAmount.token, maxAmountInput)

  const addTransaction = useTransactionAdder()
  const deadline = useTransactionDeadline()
  const [approval, approveCallback] = useApproveCallback(parsedAmount, vaiStakingInfo.stakingRewardAddress)

  const stakingContract = useVaiStakingContract(vaiStakingInfo.stakingRewardAddress)

  const onUserInput = useCallback((typedValue: string) => {
    setTypedValue(typedValue)
  }, [])

  const handleDismiss = useCallback(() => {
    setHash(undefined)
    setAttempting(false)
    onDismiss()
  }, [onDismiss])

  const currencyBalance = useCurrencyBalance(account ?? undefined, vaiStakingInfo.stakedAmount.token ?? undefined)
  const maxAmountOrCurrentBalance =
    currencyBalance && maxAmountInput.greaterThan(currencyBalance) ? currencyBalance : maxAmountInput
  const atMaxAmount = Boolean(maxAmountInput && parsedAmount?.equalTo(maxAmountInput))

  const handleMax = useCallback(() => {
    maxAmountInput &&
      onUserInput(
        !currencyBalance
          ? maxAmountInput.toExact()
          : maxAmountInput.greaterThan(JSBI.BigInt(currencyBalance.toFixed(0)))
          ? currencyBalance?.toExact()
          : maxAmountInput.toExact()
      )
  }, [maxAmountInput, onUserInput, currencyBalance])

  const onStake = async () => {
    setAttempting(true)
    if (stakingContract && parsedAmount) {
      if (deadline) {
        if (approval === ApprovalState.APPROVED) {
          await stakingContract
            .stake(`0x${parsedAmount.raw.toString(16)}`, { gasLimit: 350000 })
            .then((response: TransactionResponse) => {
              addTransaction(response, {
                summary: `Deposit VAI`
              })
              setHash(response.hash)
            })
            .catch((error: any) => {
              setAttempting(false)
              console.log(error)
            })
        } else {
          setAttempting(false)
          throw new Error('Attempting to stake without approval or a signature. Please contact support.')
        }
      }
    }
  }

  const onAttemptToApprove = async () => {
    if (!library || !deadline) throw new Error('missing dependencies')
    if (!parsedAmount) throw new Error('missing stake amount')
    return approveCallback()
  }

  return (
    <Modal isOpen={isOpen} onDismiss={handleDismiss} maxHeight={90}>
      {!attempting && !hash && (
        <ContentWrapper gap="lg">
          <RowBetween>
            <TYPE.mediumHeader>Deposit</TYPE.mediumHeader>
            <CloseIcon onClick={handleDismiss} />
          </RowBetween>
          <CurrencyInputPanel
            value={typedValue}
            onUserInput={onUserInput}
            onMax={handleMax}
            showMaxButton={!atMaxAmount}
            currency={vaiStakingInfo.stakedAmount.token}
            label={''}
            disableCurrencySelect={true}
            customBalanceText={'Available to deposit: '}
            selectedCurrencyBalance={maxAmountOrCurrentBalance}
            id="stake-vai-token"
          />

          <RowBetween>
            <ButtonConfirmed
              mr="0.5rem"
              onClick={onAttemptToApprove}
              confirmed={approval === ApprovalState.APPROVED}
              disabled={approval !== ApprovalState.NOT_APPROVED}
            >
              Approve
            </ButtonConfirmed>

            <ButtonError
              disabled={!!error || approval !== ApprovalState.APPROVED}
              error={!!error && !!parsedAmount}
              onClick={onStake}
            >
              {error ?? 'Deposit'}
            </ButtonError>
          </RowBetween>
          <ProgressCircles steps={[approval === ApprovalState.APPROVED]} disabled={true} />
        </ContentWrapper>
      )}

      {attempting && !hash && (
        <LoadingView onDismiss={handleDismiss}>
          <AutoColumn gap="12px" justify={'center'}>
            <TYPE.largeHeader>Depositing VAI</TYPE.largeHeader>
            <TYPE.body fontSize={20}>{parsedAmount?.toSignificant(4)} VAI</TYPE.body>
          </AutoColumn>
        </LoadingView>
      )}

      {attempting && hash && (
        <SubmittedView onDismiss={handleDismiss} hash={hash}>
          <AutoColumn gap="12px" justify={'center'}>
            <TYPE.largeHeader>Transaction Submitted</TYPE.largeHeader>
            <TYPE.body fontSize={20}>Deposited {parsedAmount?.toSignificant(4)} VAI</TYPE.body>
          </AutoColumn>
        </SubmittedView>
      )}
    </Modal>
  )
}

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 1rem;
`
