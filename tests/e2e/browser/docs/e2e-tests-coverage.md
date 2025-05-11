| Feature       | Requirements       | Test file       |
|--------------|--------------------|-----------------|
| **Menu** |||
| Menu    | Unauthenticated user; basic menu button functionality and accessibility  | menu.spec.js |
| **Toolbars and associated actions and commands** |||
| Toolbar    | Unauthenticated user can see toolbar in both available modes (author and social); unauthenticated user can see all popups when clicking on buttons with an associated popup  | toolbar.spec.js |
| Toolbar commands (author)  | Unauthenticated user; formatting commands (bold, italics, headings from level 1 to level 4, code, pre) work as expected | toolbar-commands.spec.js |
| Bookmarks    | Authenticated user; user can create a bookmark and it is correctly reflected on the document; user can delete a bookmark  | bookmark.spec.js |
| Quote with source    | Authenticated user; ...  |  |
| Citation    | Authenticated user; ...  |  |
| Semantics    | Authenticated user; ...  |  |
| Share   | Authenticated user; ...  |  |
| Approve / Disapprove    | Authenticated user; ...  |  |
| Specificity   | Authenticated user; ...  |  |
| Comment   | Authenticated user; ...  |  |
| **Document actions (new, save, save as)** ||| 
| New   | Unauthenticated user; ...  | new.spec.js |
| Save As   | Authenticated user; ...  | save-as.spec.js |
| Save   | Authenticated user; ...  | save.spec.js |
| **Authentication** ||| 
| Login   | Unauthenticated user; ...  | login.test.js |
| Logout   | Authenticated user; ...  | login.test.js |
| **Notifications** ||| 
| Notifications panel  | Authenticated user; User can see notifications on side panel; clicking on a notification on the document highlights side panel  | notifications.spec.js |
| **Open** ||| 
| Open   | Unauthenticated user; User can open a document from a URL or a local file | open.spec.js |
| **Graph** ||| 
| Open   | Unauthenticated user |  |
| **Total** | **22 features** | **12 tested (54,54%)** |
