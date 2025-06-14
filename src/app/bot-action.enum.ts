/**
 * Bot actions
 */
export enum BotAction {
  CANCEL_GAME = 'cancel_game',
  START_GAME = 'start_game',
  DRAW = 'draw',
  EXPLODE = 'explode',
  DEFUSE_KITTEN = 'defuse_kitten',
  PUT_EXPLODING_BACK_TO_DECK = 'exploding_back_deck',
  ALTER_THE_FUTURE_ACTION = 'alter_future_action',
  ALTER_THE_FUTURE_OK = 'alter_future_ok',
  ALTER_THE_FUTURE_RESET = 'alter_future_reset',
  CANCEL_CARD = 'cancel_card',
  STEAL_CARD = 'steal_card',
  REQUEST_CARD = 'request_card',
  STEAL_FROM_PLAYER = 'steal_from',
  CARD_TO_STEAL = 'card_to_steal',
  FAVOR_FROM_PLAYER = 'favor_from',
  DO_FAVOR = 'do_favor',
}
