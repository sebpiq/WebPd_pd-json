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

import assert from 'assert'
import { getReferencesToSubpatch, resolveDollarArg } from './pdjson-helpers'
import {
    pdJsonPatchDefaults,
    pdJsonNodeDefaults,
    makePd,
    pdJsonDefaults,
} from './test-helpers'
import { PdJson } from './types'

describe('pdjson-helpers', () => {
    describe('getReferencesToSubpatch', () => {
        it('should return nodes referencing the given patch', () => {
            const pd: PdJson.Pd = {
                patches: {
                    '0': {
                        ...pdJsonPatchDefaults('0'),
                        nodes: {
                            '0': {
                                ...pdJsonNodeDefaults('0'),
                                refId: '2',
                            },
                            '1': pdJsonNodeDefaults('1'),
                            '2': {
                                ...pdJsonNodeDefaults('2'),
                                refId: '2',
                            },
                            '3': {
                                ...pdJsonNodeDefaults('3'),
                                refId: '1234',
                            },
                        },
                    },
                    '1': {
                        ...pdJsonPatchDefaults('1'),
                        nodes: {
                            '12': {
                                ...pdJsonNodeDefaults('12'),
                                refId: '2',
                            },
                        },
                    },
                    '2': {
                        ...pdJsonPatchDefaults('2'),
                        nodes: {
                            '0': pdJsonNodeDefaults('0'),
                        },
                    },
                },
                arrays: {},
            }

            assert.deepEqual(getReferencesToSubpatch(pd, '2'), [
                ['0', '0'],
                ['0', '2'],
                ['1', '12'],
            ])

            assert.deepEqual(getReferencesToSubpatch(pd, '1234'), [['0', '3']])

            assert.deepEqual(getReferencesToSubpatch(pd, '5678'), [])
        })
    })

    describe('resolveDollarArg', () => {
        const pd = makePd({
            ...pdJsonDefaults(),
            patches: {
                p1: { nodes: {}, connections: [], args: ['hihi', 'haha', 123] },
            },
        })

        it('should resolve $0 to patch id', () => {
            assert.deepStrictEqual(
                resolveDollarArg('$0-BLA', pd.patches.p1),
                'p1-BLA'
            )
        })

        it('should resolve other $ to patch args', () => {
            assert.deepStrictEqual(
                resolveDollarArg('BLA-$1$3', pd.patches.p1),
                'BLA-hihi123'
            )
        })

        it('should throw an error if $ out of range', () => {
            assert.throws(() => resolveDollarArg('BLA-$10', pd.patches.p1))
        })

        it('should leave string untouched', () => {
            assert.deepStrictEqual(
                resolveDollarArg('BLA BLA', pd.patches.p1),
                'BLA BLA'
            )
        })
    })
})
