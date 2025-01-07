import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as efs from 'aws-cdk-lib/aws-efs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'InterviewAppVPC', {
      maxAzs: 2
    });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'InterviewAppCluster', {
      vpc: vpc
    });

    // Create EFS File System for persistent storage
    const fileSystem = new efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Create Redis (ElastiCache)
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId)
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis cluster',
      allowAllOutbound: true
    });

    const redis = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
    });

    // Create ECS Task Definitions with volume mounts
    const backendTaskDefinition = new ecs.FargateTaskDefinition(this, 'BackendTask', {
      memoryLimitMiB: 1024,
      cpu: 512,
      volumes: [
        {
          name: 'efs-audio',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: fileSystem.addAccessPoint('AudioAccessPoint', {
                path: '/audio',
                createAcl: {
                  ownerGid: '1000',
                  ownerUid: '1000',
                  permissions: '755'
                },
                posixUser: {
                  gid: '1000',
                  uid: '1000'
                }
              }).accessPointId
            }
          }
        },
        {
          name: 'efs-uploads',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: fileSystem.addAccessPoint('UploadsAccessPoint', {
                path: '/uploads',
                createAcl: {
                  ownerGid: '1000',
                  ownerUid: '1000',
                  permissions: '755'
                },
                posixUser: {
                  gid: '1000',
                  uid: '1000'
                }
              }).accessPointId
            }
          }
        }
      ]
    });

    // Backend Container
    const backendContainer = backendTaskDefinition.addContainer('BackendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, 'BackendRepo', 'backend-repo')
      ),
      environment: {
        REDIS_HOST: redis.attrRedisEndpointAddress,
        REDIS_PORT: redis.attrRedisEndpointPort
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'backend' })
    });

    backendContainer.addMountPoints(
      {
        sourceVolume: 'efs-audio',
        containerPath: '/app/audio',
        readOnly: false
      },
      {
        sourceVolume: 'efs-uploads',
        containerPath: '/app/uploads',
        readOnly: false
      }
    );

    // Frontend Service
    const frontendService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'FrontendService', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 2,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(
          ecr.Repository.fromRepositoryName(this, 'FrontendRepo', 'frontend-repo')
        ),
        containerPort: 80
      },
      publicLoadBalancer: true
    });

    // Backend Service
    const backendService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDefinition,
      desiredCount: 2,
      publicLoadBalancer: true
    });

    // Allow backend to access Redis
    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow backend to access Redis'
    );

    // Allow backend to access EFS
    fileSystem.connections.allowDefaultPortFrom(backendService.service);

    // Output the endpoints
    new cdk.CfnOutput(this, 'FrontendURL', {
      value: frontendService.loadBalancer.loadBalancerDnsName
    });

    new cdk.CfnOutput(this, 'BackendURL', {
      value: backendService.loadBalancer.loadBalancerDnsName
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redis.attrRedisEndpointAddress
    });
  }
}