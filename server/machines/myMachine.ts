import { EventFromLogic, ContextFrom, setup } from "xstate";

export const myMachine = setup({
  types: {
    events: {} as { type: "process" } | { type: "processed" } | { type: "received" },
    context: {},
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCeBZAhgYwBYEsA7MAOgFVCAHAJwHts5ZIBiAbQAYBdRUS22fABd8tQjxAAPRAEYAnACYSANnkAWWbIAc7AKwBmfTs06ANCFSJNekrPUbN8+XvZ6lO1QF8PZtFjxFSAAU6BlgBQihmGnpGSA5uJBA+AWFRcSkEVXlpEgB2FXVHHVzZaR13MwsEBxJVOy01fU0HWS8fDBwCYhIAdUwhIigAAgBJKgBXQWZqMAZ8ADc4rnFkgbTEjNzpdhJy9nZpfOklTVlc03NLRTqNBtUmlq9vEEJaCDhxX06Alf41sQ2iAAtEpKsClCR9lDoTDcm0QF9-N0KNFQkwIL8UiIAaAMlkwdVFO5bpolHp5JppJpVHDnoiukEQrEMYlVqkcZJLAZavIdAclNIKUo6tICZSSPJblo3NI6oV4fSAiRgjEwoNMf90oghTZBepiTo5BSxUT6qTyZTqbT2n4Gb1+sIIqMJoINeytQgdEodqo9Odjny9LIlFsTbszWSKVSaU8PEA */
  id: "myMachine",

  context: () => {
    return {};
  },

  initial: "Unprocessed",

  states: {
    Unprocessed: {
      always: "Processing",
    },

    Processed: {
      type: "final"
    },

    Processing: {
      on: {
        processed: {
          target: "Waiting Input",
          reenter: true
        },
      },
    },

    "Waiting Input": {
      on: {
        received: "Processed"
      }
    }
  },
});

export type MyMachineEvents = EventFromLogic<typeof myMachine>;
export type MyMachineContext = ContextFrom<typeof myMachine>;
