const index = ({ activeGroups, cacheDuration, maxReq, maxReqWindow, version }: { activeGroups: { name: string; lastUpdateTle: string; lastUpdateJson: string }[]; cacheDuration: number; maxReq: number; maxReqWindow: number; version: string }) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta http-equiv="X-UA-Compatible" content="ie=edge" />
			<meta name="description" content="Celestrak TLE caching server" />
			<meta name="keywords" content="TLE, Celestrak, satellite, cache, satrx" />
			<meta name="author" content="MrTalon63" />
			<meta name="theme-color" content="#3c4258" />
			<meta property="og:title" content="ReTLEctor" />
			<meta property="og:description" content="Celestrak TLE caching server" />
			<meta property="og:image" content="https://retlector.eu/retlector.png" />
			<meta property="og:type" content="website" />
			<meta name="twitter:card" content="summary" />
			<meta name="twitter:title" content="ReTLEctor" />
			<meta name="twitter:description" content="Celestrak TLE caching server" />
			<meta name="robots" content="index, follow" />
			<link rel="canonical" href="https://retlector.eu" />
			<link rel="icon" href="/favicon.ico" type="image/x-icon" />
			<title>ReTLEctor</title>
			<link rel="stylesheet" href="/styles.css" />
		</head>
		<body>
			<h1>Welcome to ReTLEctor</h1>
			<p>This is a simple web app to cache and return TLEs from Celestrak, so you can avoid getting blocked by their servers when you need to get TLEs for a large number of satellites (Or you testing shit).</p>

			<p>
				Currently supported formats are <strong>3LE</strong> under <code>/tle/[group]</code> and <strong>JSON CCSDS OMM</strong> under <code>/json/[group]</code>
			</p>

			<p>
				Custom NORAD ID requests are supported via <code>/norad/[NORAD_ID]</code>.<br />
				Please note that this is very experimental and currently only in <strong>3LE</strong> format.
			</p>

			<h3>Table below represents the cached TLEs and their URIs as well as last update time:</h3>

			<table>
				<tr>
					<th>TLE (group)</th>
					<th>Last Update (TLE)</th>
					<th>Last Update (JSON)</th>
				</tr>
				{activeGroups.map((group) => (
					<tr>
						<td>{group.name}</td>
						<td>{group.lastUpdateTle}</td>
						<td>{group.lastUpdateJson}</td>
					</tr>
				))}
			</table>

			<p>Data is updated every ~{cacheDuration / 1000 / 60} minutes.</p>
			<p>
				Current rate limit is {maxReq} requests per {maxReqWindow / 1000} seconds. That might change in the future, pay attention to the headers returned by the server.
			</p>
			<p>
				Source code is available on{" "}
				<a href="https://github.com/MrTalon63/retlector" target="_blank">
					GitHub
				</a>
				. Feel free to contribute!
			</p>
			<p>ReTLEctor version: {version}</p>
		</body>
	</html>
);

export default index;
