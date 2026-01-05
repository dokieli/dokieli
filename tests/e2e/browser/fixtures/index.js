/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import base from "@playwright/test";
export class Auth {
  constructor(page, isMobile) {
    
    this.page = page;
    this.isMobile = isMobile;
  }

  async login() {
    await this.page.goto("/");
    await this.page.locator("#document-menu > button").click();

    const signinbtn = "button.signin-user";
    await this.page.waitForSelector(signinbtn);
    await this.page.click(signinbtn);

    await this.page.fill('input[id="webid"]', process.env.WEBID);
    await this.page.click('button[class="signin"]');

    // click login btn
    await this.page.waitForSelector("button[type=submit]");
    await this.page.click("button[type=submit]");

    // account page to enter credentials and login

    await this.page.waitForURL(/https:\/\/[^/]+\/\.account\/login\/password\/?/, {
      timeout: 10000,
    });
    await this.page.waitForSelector("input#email");

    await this.page.fill("#email", process.env.LOGIN_ID);
    await this.page.fill("#password", process.env.LOGIN_PASSWORD);
    await this.page.click("button[type=submit]");


    // consent page to authorize the client
    await this.page.waitForURL(/https:\/\/[^/]+\/\.account\/oidc\/consent\/?/, {
      timeout: 10000,
    });
    // wait until page fully loaded (last item to appear is ID)
    await this.page.waitForSelector('[id="client"]');


    // click authorize btn
    await this.page.waitForSelector("button[type=submit]");
    await this.page.click("button[type=submit]");
    


    // await redirect
    await this.page.waitForURL('**', { timeout: 10000 });  

    // wait to redirect to homepage
    await this.page.waitForURL("http://localhost:3000/");

    // Listen for console messages to make sure we are logged in // FIX THIS: ideally we would check something in the UI
    await this.page.on("console", async (msg) => {
      await new Promise(async (resolve) => {
          if (msg.text().includes(process.env.WEBID)) {
            resolve();
          }
      });
    });

  }
}

export const test = base.test.extend({
  auth: async ({ page, isMobile }, use, testInfo) => {
    testInfo.setTimeout(120_000); 
    const auth = new Auth(page, isMobile);
    await use(auth);
  },
});

export const expect = base.expect;
