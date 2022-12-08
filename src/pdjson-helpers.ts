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

import { PdJson } from './types'

// Regular expressions to deal with dollar-args
const DOLLAR_VAR_REGEXP_GLOB = /\$(\d+)/g

export type ReferencesToSubpatch = Array<
    [PdJson.ObjectGlobalId, PdJson.ObjectLocalId]
>

export const getReferencesToSubpatch = (
    pd: PdJson.Pd,
    refId: PdJson.ObjectGlobalId
): ReferencesToSubpatch => {
    return Object.values(pd.patches).reduce((allReferences, patch) => {
        const nodes: ReferencesToSubpatch = Object.values(patch.nodes)
            .filter((node) => node.refId === refId)
            .map((node) => [patch.id, node.id])
        if (nodes.length === 0) {
            return allReferences
        }
        return [...allReferences, ...nodes]
    }, [] as ReferencesToSubpatch)
}

// Takes an object string arg which might contain dollars, and returns the resolved version.
// e.g. :
// [table $0-ARRAY] inside a patch with ID 1887 would resolve to [table 1887-ARRAY]
export const resolveDollarArg = (arg: string, patch: PdJson.Patch) => {
    const patchArgs = [patch.id, ...patch.args.map((arg) => arg.toString())]
    let matchDollar
    while ((matchDollar = DOLLAR_VAR_REGEXP_GLOB.exec(arg))) {
        const patchInd = parseInt(matchDollar[1], 10)
        if (patchInd >= patchArgs.length || patchInd < 0) {
            throw new Error(
                '$' + (patchInd + 1) + ': argument number out of range'
            )
        }
        arg = arg.replace(matchDollar[0], patchArgs[patchInd])
    }
    return arg
}
