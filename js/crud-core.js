function clearForm() {
  $('#expense-id').val('')
  $('#expense-title').val('')
  $('#expense-amount').val('')
  $('#btn-add').removeClass('d-none')
  $('#btn-edit').addClass('d-none')
}

function addRowToTable(e) {
  const safeAmount = !isNaN(e.amount) ? parseFloat(e.amount).toFixed(2) : '0.00'

  const row = $(`<tr>
    <td>${e.id}</td>
    <td>${e.title}</td>
    <td>${safeAmount}</td>
    <td>
      <button class="btn btn-sm btn-warning btn-edit">Edit</button>
      <button class="btn btn-sm btn-danger btn-delete">Del</button>
    </td>
  </tr>`)

  row.find('.btn-edit').click(() => {
    $('#expense-id').val(e.id)
    $('#expense-title').val(e.title)
    $('#expense-amount').val(e.amount)
    $('#btn-add').addClass('d-none')
    $('#btn-edit').removeClass('d-none')
  })

  row.find('.btn-delete').click(() => {
    window.currentDeleteId = e.id
    const modal = new bootstrap.Modal(document.getElementById('confirm-modal'))
    modal.show()
  })

  $('#expenses-table tbody').append(row)
}

function bindCRUDButtons() {
  $('#btn-cancel').click(() => clearForm())

  $('#btn-add').click(() => {
    const title = $('#expense-title').val()
    const amount = parseFloat($('#expense-amount').val())

    if (!title || isNaN(amount)) {
      alert('Please enter a valid title and numeric amount')
      return
    }

    $.ajax({
      url: apiBase,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ title, amount }),
      success: res => {
        addRowToTable(res)
        clearForm()
      },
      error: () => alert("Failed to add")
    })
  })

  $('#btn-edit').click(() => {
    const id = $('#expense-id').val()
    const title = $('#expense-title').val()
    const amount = parseFloat($('#expense-amount').val())

    if (!title || isNaN(amount)) {
      alert('Please enter a valid title and numeric amount')
      return
    }

    $.ajax({
      url: `${apiBase}/${id}`,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ title, amount }),
      success: updated => {
        const row = $(`#expenses-table tbody tr`).filter((i, el) => $(el).find('td:first').text() === id)
        row.find('td:nth-child(2)').text(updated.title)
        row.find('td:nth-child(3)').text(parseFloat(updated.amount).toFixed(2))
        clearForm()
      },
      error: () => alert("Failed to update")
    })
  })

  $('#confirm-delete').click(() => {
    if (!window.currentDeleteId) return

    $.ajax({
      url: `${apiBase}/${window.currentDeleteId}`,
      method: 'DELETE',
      success: () => {
        $(`#expenses-table tbody tr`).filter((i, el) => $(el).find('td:first').text() === window.currentDeleteId).remove()
        const modal = bootstrap.Modal.getInstance(document.getElementById('confirm-modal'))
        modal.hide()
      },
      error: () => alert("Failed to delete")
    })
  })
}
