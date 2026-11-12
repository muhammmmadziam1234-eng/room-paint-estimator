# Room Paint Estimator

Second Coat is a responsive website for a fictional painting studio. Visitors enter room dimensions, choose a finish and optional work, then get an itemized estimate they can download or reopen from a shareable link.

![Room Paint Estimator screenshot](docs/preview.png)

## Run locally

Requires Node.js 22 or later. There are no packages to install.

~~~sh
npm start
npm test
~~~

Open http://127.0.0.1:4190. Change the finish, add ceiling painting, and update the estimate to see which line items changed. The shareable link contains only dimensions and options; no account or personal information is needed.

The estimate uses the perimeter times wall height for wall area and the floor dimensions for ceiling area. Each line is rounded to cents before summing. Rates are fictional, and the estimator does not deduct doors or windows, create bookings, or collect personal information.

The static app can be hosted on GitHub Pages from the repository root.
