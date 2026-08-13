import pytest

URL = "https://www.the-image-editor.com/image/crop"
DROPZONE_CSS = "#upload-drop"


async def does_scrollbar_appear(client):
    # make the window shorter to ensure that a scrollabr appears.
    client.set_screen_size(1024, 600)
    await client.navigate(URL)
    dropzone = client.await_css(DROPZONE_CSS, is_displayed=True)
    client.execute_script(
        """
        const [dropzone] = arguments;
        const dataTransfer = {
          dropEffect: "copy",
          effectAllowed: "uninitialized",
          files: [{
            lastModified: 1785973812872,
            name: "tall.png",
            size: 157,
            type: "image/png",
            webkitRelativePath: "",
          }],
          items: DataTransferItemList,
          mozCursor: "auto",
          mozSourceNode: null,
          mozUserCancelled: false,
          types: ["Files"],
        };
        const e = new CustomEvent("drop", {});
        e.dataTransfer = dataTransfer;
        dropzone.dispatchEvent(e);
    """,
        dropzone,
    )
    await client.stall(2)
    return client.execute_script("return window.innerWidth > document.body.scrollWidth")


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await does_scrollbar_appear(client)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await does_scrollbar_appear(client)
