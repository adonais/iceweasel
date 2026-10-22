This chapter describes the NSPR API for managing linked lists. The API
is a set of macros for initializing a circular (doubly linked) list,
inserting and removing elements from the list. The macros are not thread
safe. The caller must provide for mutually-exclusive access to the list,
and for the nodes being added and removed from the list.

- [Linked List Types](#linked-list-types)
- [Linked List Macros](#linked-list-macros)

(linked-list-types)=

# Linked List Types

The {doc}`prclist` type represents a circular linked list.

(linked-list-macros)=

# Linked List Macros

Macros that create and operate on linked lists are:

> - {doc}`pr_init_clist`
> - {doc}`pr_init_static_clist`
> - {doc}`pr_append_link`
> - {doc}`pr_insert_link`
> - {doc}`pr_next_link`
> - {doc}`pr_prev_link`
> - {doc}`pr_remove_link`
> - {doc}`pr_remove_and_init_link`
> - {doc}`pr_insert_before`
> - {doc}`pr_insert_after`
> - {doc}`pr_clist_is_empty`
> - {doc}`pr_list_head`
> - {doc}`pr_list_tail`
