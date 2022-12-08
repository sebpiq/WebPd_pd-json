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

import { DspGraph } from '@webpd/dsp-graph'
import { ConversionData } from './to-dsp-graph'
import { NodeBuilder, NodeBuilders, PdJson } from './types'

type ConcisePdConnection = [
    PdJson.ObjectLocalId,
    PdJson.PortletId,
    PdJson.ObjectLocalId,
    PdJson.PortletId
]

type ConcisePatch = Partial<Omit<PdJson.Patch, 'connections'>> & {
    nodes: { [localId: string]: PdJson.Node }
    connections: Array<ConcisePdConnection>
}

type ConcisePd = { patches: { [patchId: string]: ConcisePatch } }

type ConciseNodeBuilders = {
    [nodeType: string]: {
        inletTypes?: Array<DspGraph.PortletType>
        outletTypes?: Array<DspGraph.PortletType>
        isEndSink?: boolean
        translateArgs?: NodeBuilder<any>['translateArgs']
        rerouteConnectionIn?: NodeBuilder<any>['rerouteConnectionIn']
        build?: NodeBuilder<any>['build']
    }
}

export const pdJsonDefaults = (): PdJson.Pd => ({
    patches: {},
    arrays: {},
})

export const pdJsonPatchDefaults = (
    id: PdJson.ObjectGlobalId
): PdJson.Patch => ({
    id,
    nodes: {},
    args: [],
    outlets: [],
    inlets: [],
    connections: [],
})

export const pdJsonNodeDefaults = (id: PdJson.ObjectLocalId): PdJson.Node => ({
    id,
    args: [],
    type: 'DUMMY',
})

export const makeConnection = (
    conciseConnection: ConcisePdConnection
): PdJson.Connection => ({
    source: {
        nodeId: conciseConnection[0],
        portletId: conciseConnection[1],
    },
    sink: {
        nodeId: conciseConnection[2],
        portletId: conciseConnection[3],
    },
})

export const makePd = (concisePd: ConcisePd): PdJson.Pd => {
    const pd: PdJson.Pd = pdJsonDefaults()

    Object.entries(concisePd.patches).forEach(([patchId, concisePatch]) => {
        pd.patches[patchId] = {
            ...pdJsonPatchDefaults(patchId),
            ...pd.patches[patchId],
            ...concisePatch,
            connections: concisePatch.connections.map(makeConnection),
        }
    })
    return pd
}

// Necessary because `ConversionData.graph` is readonly
export const setConversionDataGraph = (
    conversion: ConversionData,
    graph: DspGraph.Graph
) => {
    Object.keys(conversion.graph).forEach((key) => delete conversion.graph[key])
    Object.keys(graph).forEach((key) => (conversion.graph[key] = graph[key]))
}

export const makeNodeBuilders = (
    conciseNodeBuilders: ConciseNodeBuilders
): NodeBuilders => {
    const nodeBuilders: NodeBuilders = {}
    Object.entries(conciseNodeBuilders).forEach(([nodeType, entryParams]) => {
        let build: NodeBuilder<any>['build']
        if (!entryParams.build) {
            const defaultPortletsTemplate: Array<DspGraph.PortletType> = [
                'message',
            ]

            const inletsTemplate: DspGraph.PortletMap = {}
            ;(entryParams.inletTypes || defaultPortletsTemplate).map(
                (inletType, i) => {
                    inletsTemplate[`${i}`] = {
                        type: inletType,
                        id: i.toString(10),
                    }
                }
            )

            const outletsTemplate: DspGraph.PortletMap = {}
            ;(entryParams.outletTypes || defaultPortletsTemplate).map(
                (outletType, i) => {
                    outletsTemplate[`${i}`] = {
                        type: outletType,
                        id: i.toString(10),
                    }
                }
            )

            build = () => {
                let extraArgs: Partial<DspGraph.Node> = {}
                if (entryParams.isEndSink) {
                    extraArgs = { isEndSink: entryParams.isEndSink }
                }
                return {
                    ...extraArgs,
                    inlets: inletsTemplate,
                    outlets: outletsTemplate,
                }
            }
        }

        nodeBuilders[nodeType] = {
            build: entryParams.build || build,
            translateArgs: entryParams.translateArgs || (() => ({})),
            rerouteConnectionIn: entryParams.rerouteConnectionIn || undefined,
        }
    })
    return nodeBuilders
}
