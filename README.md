# Collaborative Block-listing Bot for Matrix
This repo contains an implementation of a collaborative text block-list for
[Matrix](https://matrix.org/). The block-list is enforced by a bot and the
current implementation is geared toward end-to-end encrypted (E2EE) rooms. As
such, we use [Pantalaimon](https://matrix.org/docs/projects/other/pantalaimon)
to handle the encryption and decryption of messages. We make use of the
[Matrix bot SDK](https://github.com/turt2live/matrix-bot-sdk) to implement
the bot.

In order to run the bot, you'll have to enter the
proper credentials into a file called config.yaml. Create an account for your
bot and place the username and password associated with that account into the
config.yaml file.

Then, you can run the bot as follows:
```
node index.js
```

The bot currently implements a voting policy for a collaborative content
blocklist. A majority vote is required to add or remove text from the
block-list. The bot will also perform block-list enforcement: a warning
message will be displayed for messages that contain text that appears on
the block-list.

Votes are cast using
thumbs-up and thumbs-down reacts. The current version is a proof of concept
and hardcodes the number of participants at 2.

Voting can be modularly composed with any proposed action since the `Vote`
object itself contains a lambda function that will be executed upon the
vote passing.

## Running with Pantalaimon
In order for the bot to function in an end-to-end encrypted room, we must
use Pantalaimon, which acts as a reverse-proxy. The configuration for
Pantalaimon, which should be in `pantalaimon.conf`, should look like this:

```
[Default]
LogLevel = Debug
SSL = True

[local-matrix]
Homeserver = https://matrix.org
ListenAddress = 0.0.0.0
ListenPort = 8008
SSL = False
UseKeyring = False
IgnoreVerification = True
```

This configuration was taken from the Pantalaimon documentation.

One way to get Pantalaimon up and running is to use their docker container.
Once you've pulled the container, a command of the following form should do
what you want:

```
docker run -it --rm -v <full-path-to-pant-dir>:/data -p 8008:8008 matrixdotorg/pantalaimon
```

Where `<full-path-to-pant-dir>` points to a directory containing the appropriate
`pantalaimon.conf` file as specified above.

Make sure to start Pantalaimon before running the bot script.

## Disclaimer
The code presented here is merely a proof of concept and has not undergone
thorough vetting for potential security issues.
