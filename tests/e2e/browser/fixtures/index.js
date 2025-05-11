import base from "@playwright/test";
export class Auth {
  constructor(page, isMobile) {
    this.page = page;
    this.isMobile = isMobile;
  }

  async login() {
    await this.page.goto("/");
    await this.page.locator("#document-menu > button").click();

    if (this.isMobile) {
      await this.page.locator(".close").click();
    }

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
  auth: async ({ page, isMobile }, use) => {
    const auth = new Auth(page, isMobile);
    await use(auth);
  },
});

export const expect = base.expect;
