See http://puredata.info/docs/developer/PdFileFormat for the Pd file format reference.


Pd behaviour
---------------

- dsp inlets automatically sum their sources
    -> Will be handled at dsp graph compilation : special [mixer~] nodes automatically inserted
    -> Signal nodes' inlets can have only ONE incoming connection
- some dsp inlets also accept messages (for example [osc~] first inlet can be signal or float)
    -> Will be handled at dsp graph compilation : mixed signal / control inlets split in 2 distinct inlets
    -> Strict separation between control and signal
- nodes must be able to handle several messages in one tick
    -> Will be handled by the engine


solution 1 : signal Array<number>
    the array has unknown size (depending on how many values it receives). For example for osc~ frequency port, the last value 
        of the array is the frequency that should be kept for that iteration. Rest is discarded
    after each iteration, the array must be emptied

solution 2 : compile separately control / signal loops
    what happens with signal nodes that output control value and vice / versa
    what runs first ? What if a node analyses the signal input and must send a control value, e.g. a 'bang' which must be handled in the same loop run ?
    do we need to run interleaved dsp and control graphs ?



Differences with pd specification
------------------------------------

[+~] must support a variable number of inputs

Each input can have only a single source connected to it. 


Scripts
---------



### test

Tests are running with `mocha` and `node-ts`. Simply run with :

```bash
npm test
# or
npm run test-bail
```

`node-ts` has a few quirks, for an explanation of how the command is ran look [there](https://github.com/TypeStrong/ts-node#mocha) and [there](https://github.com/TypeStrong/ts-node#help-my-types-are-missing).