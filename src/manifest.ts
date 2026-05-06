export default {
  display_information: {
    name: "Oda",
    description: "Grocery shopping assistant powered by Oda",
    background_color: "#1a1a2e",
  },
  features: {
    bot_user: {
      display_name: "Oda",
      always_online: true,
    },
    assistant_view: {
      assistant_description:
        "Grocery shopping assistant for the office. Search products, manage the shared cart, and track Oda deliveries.",
    },
  },
  oauth_config: {
    scopes: {
      bot: [
        "app_mentions:read",
        "assistant:write",
        "channels:history",
        "channels:read",
        "chat:write",
        "files:read",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "mpim:history",
        "mpim:read",
        "reactions:read",
        "reactions:write",
        "users:read",
      ],
    },
  },
  settings: {
    event_subscriptions: {
      bot_events: [
        "app_mention",
        "assistant_thread_context_changed",
        "assistant_thread_started",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim",
      ],
    },
    interactivity: {
      is_enabled: true,
    },
    org_deploy_enabled: false,
    socket_mode_enabled: true,
    token_rotation_enabled: false,
  },
};
