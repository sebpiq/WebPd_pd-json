/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import assert from "assert"
import { assertNumber, assertOptionalNumber } from "./validation"

describe('validation', () => {

    describe('assertNumber', () => {
        it('should return a number if input is a number', () => {
            assert.strictEqual(assertNumber(12), 12)
        })

        it('should return throw if input is not a number', () => {
            assert.throws(() => assertNumber('12'))
            assert.throws(() => assertNumber(undefined))
        })
    })

    describe('assertOptionalNumber', () => {
        it('should return a number if input is a number', () => {
            assert.strictEqual(assertOptionalNumber(12), 12)
        })

        it('should return throw if input is not a number nor undefined', () => {
            assert.throws(() => assertOptionalNumber('12'))
        })

        it('should return undefined if input is undefined', () => {
            assert.strictEqual(assertOptionalNumber(undefined), undefined)
        })
    })
})