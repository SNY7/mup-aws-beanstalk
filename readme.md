# mup-aws-beanstalk

```bash
npm i -g @settlin/mup-aws-beanstalk
```

v0.x.x: <= Meteor 2.2.x (Amazon Linux, Node 12)
v1.x.x: >= Meteor 2.3.x (Amazon Linux 2, Node 14)

Plugin for Meteor Up to deploy using AWS Beanstalk. Forked from zodern's plugin.
With the option to add extra config files via .ebextensions and .platform.

Features:

- Load balancing with support for sticky sessions and web sockets
- Autoscaling
- Meteor settings.json
- Zero downtime deploys
- Automatically uses the correct node version

[Getting Started Guide](./docs/getting-started.md)

[Documentation](./docs/index.md)
