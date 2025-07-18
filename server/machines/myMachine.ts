import { type ContextFrom, setup, type ActorRefFrom, assign } from "xstate";
import z from "zod";

export const MyMachineEventsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("process"),
  }),
  z.object({
    type: z.literal("processed"),
    output: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    errorMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal("approved"),
  }),
  z.object({
    type: z.literal("rejected"),
  }),
]);

export type MyMachineEvents = z.infer<typeof MyMachineEventsSchema>;

export const myMachine = setup({
  types: {
    events: {} as MyMachineEvents,
    context: {} as { input?: number; output?: number; errorMessage?: string },
  },
  actors: {},
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QFsCeBZAhgYwBYEsA7MAYgCoBtABgF1FQAHAe1nwBd8nD6QAPRAOwAmAHQBGABwCALAE5pANiEKJQoWKEAaEKkTqAzCNlUqsgKwKBCsxIkqAvve1oseImBEBVQgwBOTbDhYSBI-AKDqOiQQZlYOLh5+BCFVEUsLfVl5WwEzfQVtXQQVESkqBWkqMXKpYX1HZwwcAmIRAGUwQggiKAACABUmXoBFAFcwcdD-QNhgiEieWPZObmiklTFSqiEzZQkxfQ1cwsRFESppCwsBfSoJfQFVBpAXZvd2zu7CPsGR8cmwjM5hQxFFGCxlgk1ogFJYRMJcgpZEorDcJCcEGJpKJTGppGIzBd5NIBM9Xm5WgB1TDLb69ABiTF8vQAggwwgA3TAAGxImHZ-g5kAW0SW8VWoCSYjExjSsIkphMQmxGJKZVhAgulTsNzJTQpHmptL6jOZbM5PJIvjAACswNg2MLaIsIeLEohqgS0jd9NIFfiSRihOVxNJ9GZCVjbg8CXrXC0PB0uj0BkMxhNSGBfP5fEmvlBBunxiLwXEVu7itYjGIFKZZEIBLlAzo9IcRL7bDWZdtdvlHE4QIQmBA4DxyQmXWWoZK9NJxFI5Io9mppWYMQBafEiHZhw5iRvSbHqONvVreQFBSCTyESviIcxGGRZEz3WTdgSqiQiEnlRf3SQKhIJ4GiI9JEPgsC4FeoquuW0KYr6ZjnPKJIVA8b76KqAjbsG1jCHYMr4kBA7ju8eYpr8RZgNebrwZcCilCSiIaDKwgFC2xRfj+FTZIcth3MBCYiEaHB0qarICkwXLcjRcEzggsgCJssjhgRJg9h+HElNxVjYlQmS5GYgnvAAotmTKydOd4IZcyEqMIhISMYAiyBiWJUN+R42Co2IKDWpL9kAA */
  id: "myMachine",

  context: () => {
    return {};
  },

  initial: "Unprocessed",

  states: {
    Unprocessed: {
      on: {
        process: "Sending To Queue",
      },
    },

    Finished: {
      type: "final",
    },

    "Sending To Queue": {
      on: {
        processed: [
          {
            target: "Waiting For Approval",
            actions: assign({
              errorMessage: ({ event }) => `Output ${event.output} is less than 0.5`,
            }),
            guard: ({ event }) => event.output > 0.5,
            reenter: true,
          },
          {
            target: "Error",
            reenter: true,
          },
        ],

        error: {
          target: "Error",
          actions: assign({
            errorMessage: ({ event }) => `Error sending to queue: ${event.errorMessage}`,
          }),
        },
      },
    },

    "Waiting For Approval": {
      on: {
        approved: "Finished",
        rejected: {
          target: "Sending To Queue",
          reenter: true,
        },
      },
    },

    Error: {
      type: "final",
    },
  },

  on: {
    "*": {
      // unknown event
      description: `Catch All Invalid Events`,
      target: ".Error",
      actions: assign({
        errorMessage: ({ event }) => `Unknown event: ${event.type}`,
      }),
    },
  },
});

export type MyMachineActor = ActorRefFrom<typeof myMachine>;
export type MyMachineContext = ContextFrom<typeof myMachine>;
