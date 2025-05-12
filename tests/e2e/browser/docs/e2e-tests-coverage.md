| Feature       | Requirements       | Test file       | WCAG level |
|--------------|--------------------|-----------------|------------|
| **Menu** | | | |
| Menu    | Unauthenticated user; basic menu button functionality and accessibility  | menu.spec.js | AAA |
| **Toolbars and associated actions and commands** | | | |
| Toolbar    | Unauthenticated user can see toolbar in both available modes (author and social); unauthenticated user can see all popups when clicking on buttons with an associated popup  | toolbar.spec.js | AAA |
| Toolbar commands (author)  | Unauthenticated user; formatting commands (bold, italics, headings from level 1 to level 4, code, pre) work as expected | toolbar-commands.spec.js | N/A |
| Bookmarks    | Authenticated user; user can create a bookmark and it is correctly reflected on the document; user can delete a bookmark  | bookmark.spec.js |AAA |
| Quote with source    | Authenticated user; ...  | quote.spec.js | AA |
| Citation    | Authenticated user; ...  | citation.spec.js | AA |
| Semantics    | Authenticated user; ...  |  | |
| Share   | Authenticated user; ...  | share.spec.js | AAA |
| Approve / Disapprove    | Authenticated user; ...  |  | |
| Specificity   | Authenticated user; ...  | specificity.spec.js | AAA |
| Comment   | Authenticated user; ...  | comment.spec.js | AAA |
| **Document actions (new, save, save as)** | | | |
| New   | Unauthenticated user; ...  | new.spec.js | AAA |
| Save As   | Authenticated user; ...  | save-as.spec.js | AA |
| Save   | Authenticated user; ...  | save.spec.js | N/A |
| **Authentication** | | | |
| Login   | Unauthenticated user; ...  | login.test.js | N/A |
| Logout   | Authenticated user; ...  | login.test.js | N/A |
| **Notifications** | | | |
| Notifications panel  | Authenticated user; User can see notifications on side panel; clicking on a notification on the document highlights side panel  | notifications.spec.js | AAA |
| **Open** | | | |
| Open   | Unauthenticated user; User can open a document from a URL or a local file | open.spec.js | AA |
| **Graph** | | | |
| Graph   | Unauthenticated user | graph.spec.js | AA |
| **Total** | **19 features** | **16 tested (84.21%)** | |
