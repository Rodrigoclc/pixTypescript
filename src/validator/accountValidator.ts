import vine from '@vinejs/vine'

export const createAccountValidator = vine.object({
  id: vine.string(),
  balance: vine.number().nonNegative()
});
