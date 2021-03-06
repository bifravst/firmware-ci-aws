import * as program from 'commander'
import * as chalk from 'chalk'
import { scheduleJobCommand } from './commands/scheduleJob'
import { waitForJobCommand } from './commands/waitForJob'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { promises as fs } from 'fs'
import { runCommand } from './commands/run'
import * as path from 'path'
import { runFromFileCommand } from './commands/runFromFile'
import { cancelJobCommand } from './commands/cancelJob'

const bucketName = process.env.BUCKET_NAME ?? ''
const region = process.env.AWS_REGION ?? 'us-east-1'
const ciDeviceName = process.env.CI_DEVICE ?? ''

const CLI = async ({ isCI }: { isCI: boolean }) => {
	const { version } = JSON.parse(
		await fs.readFile(
			path.normalize(path.join(__dirname, '..', '..', 'package.json')),
			'utf-8',
		),
	)

	program.description(
		`Bifravst Firmware CI Command Line Interface (${version})`,
	)
	program.version(version)

	const { Account: accountId } = await new STSClient({
		region,
	}).send(new GetCallerIdentityCommand({}))

	const commands = [
		scheduleJobCommand({
			bucketName,
			region,
			ciDeviceArn: `arn:aws:iot:${region}:${accountId}:thing/${ciDeviceName}`,
		}),
		waitForJobCommand({
			region,
		}),
		cancelJobCommand({ region }),
	]

	if (isCI) {
		console.error('Running on CI...')
	} else {
		commands.push(runCommand())
		commands.push(runFromFileCommand())
	}

	let ran = false
	commands.forEach(({ command, action, help, options }) => {
		const cmd = program.command(command)
		cmd
			.action(async (...args) => {
				try {
					ran = true
					await action(...args)
				} catch (error) {
					console.error(
						chalk.red.inverse(' ERROR '),
						chalk.red(`${command} failed!`),
					)
					console.error(chalk.red.inverse(' ERROR '), chalk.red(error))
					process.exit(1)
				}
			})
			.on('--help', () => {
				console.log('')
				console.log(chalk.yellow(help))
				console.log('')
			})
		if (options) {
			options.forEach(({ flags, description, defaultValue }) =>
				cmd.option(flags, description, defaultValue),
			)
		}
	})

	program.parse(process.argv)

	if (!ran) {
		program.outputHelp(chalk.yellow)
		throw new Error('No command selected!')
	}
}

CLI({
	isCI: process.env.CI === '1',
}).catch((err) => {
	console.error(chalk.red(err))
	process.exit(1)
})
